import { createId } from './ids'
import { generateKingsCourtRound } from './kingsCourt'
import {
  applyScore,
  editScore,
  isMatchComplete,
  isRoundComplete,
  matchWinnerFlipped,
  recomputeScoresFromMatches,
} from './scoring'
import {
  activePlayers,
  bumpSitOuts,
  canFieldCourtAfterSits,
  currentRoundHasScores,
  emptySitRequests,
  generateNextRound,
  isPlayerActive,
  normalizeSitRequests,
  playingSlots,
  playerSitState,
  recordPartnerships,
  unbumpSitOuts,
  unrecordPartnerships,
} from './schedule'
import type { KingsCourtSeed, Match, Player, RosterChangeResult, Round, Session, WinBy } from './types'

export const STORAGE_KEY = 'pickleball-americano-session-v1'

export function createEmptySession(): Session {
  return {
    id: createId('session'),
    players: [],
    courts: 2,
    pointsToWin: 11,
    winBy: 2,
    rounds: [],
    currentRoundIndex: 0,
    status: 'setup',
    phase: 'americano',
    kingsCourtSeed: 'standings',
    sitRequests: emptySitRequests(),
    scores: {},
    sitOutCounts: {},
    partnerCounts: {},
    scoreLog: [],
    createdAt: new Date().toISOString(),
  }
}


/** Case-insensitive name clash (trim). `exceptPlayerId` is the player keeping their own name. */
export function isDuplicateName(
  session: Session,
  name: string,
  exceptPlayerId?: string,
): boolean {
  const key = name.trim().toLowerCase()
  if (!key) return false
  return session.players.some(
    (p) => p.id !== exceptPlayerId && p.name.trim().toLowerCase() === key,
  )
}

/**
 * Fix a misspelled name. Keeps player id stable so differentials/standings stay tied.
 * Rejects empty names. Works in setup and active sessions (and finished for history edits if needed).
 */
export function renamePlayer(
  session: Session,
  playerId: string,
  newName: string,
): { session: Session; ok: boolean; reason?: string } {
  const trimmed = newName.trim().slice(0, 24)
  if (!trimmed) {
    return { session, ok: false, reason: 'Name cannot be empty' }
  }
  const player = session.players.find((p) => p.id === playerId)
  if (!player) {
    return { session, ok: false, reason: 'Player not found' }
  }
  if (player.name === trimmed) {
    return { session, ok: true }
  }
  if (isDuplicateName(session, trimmed, playerId)) {
    return { session, ok: false, reason: 'That name is already in the list.' }
  }
  return {
    session: {
      ...session,
      players: session.players.map((p) =>
        p.id === playerId ? { ...p, name: trimmed } : p,
      ),
    },
    ok: true,
  }
}

/** Setup-only hard remove (or used before session starts). */
export function removePlayer(session: Session, playerId: string): Session {
  if (session.status !== 'setup') return session
  const { [playerId]: _s, ...scores } = session.scores
  const { [playerId]: _o, ...sitOutCounts } = session.sitOutCounts
  void _s
  void _o
  return {
    ...session,
    players: session.players.filter((p) => p.id !== playerId),
    scores,
    sitOutCounts,
  }
}

export function setCourts(session: Session, courts: number): Session {
  if (session.status === 'finished') return session
  const c = Math.min(4, Math.max(1, Math.floor(courts)))
  return { ...session, courts: c }
}

export function setPointsToWin(session: Session, points: number): Session {
  if (session.status === 'finished') return session
  const allowed = [9, 11, 15, 21]
  const p = allowed.includes(points) ? points : Math.min(21, Math.max(5, Math.floor(points)))
  return { ...session, pointsToWin: p }
}

export function setWinBy(session: Session, winBy: WinBy): Session {
  if (session.status === 'finished') return session
  return { ...session, winBy: winBy === 1 ? 1 : 2 }
}

export function canStart(session: Session): { ok: boolean; reason?: string } {
  const n = activePlayers(session).length
  if (n < 4) {
    return { ok: false, reason: 'Need at least 4 players' }
  }
  if (session.players.length > 16) {
    return { ok: false, reason: 'Max 16 players' }
  }
  if (session.courts < 1 || session.courts > 4) {
    return { ok: false, reason: 'Courts must be 1–4' }
  }
  const slots = playingSlots(n, session.courts)
  if (slots < 4) {
    return { ok: false, reason: 'Not enough players for a court' }
  }
  return { ok: true }
}

/** Enough active players to keep generating rounds. */
export function canContinuePlay(session: Session): { ok: boolean; reason?: string } {
  const n = activePlayers(session).length
  if (n < 4) {
    return { ok: false, reason: 'Need at least 4 active players to continue' }
  }
  if (playingSlots(n, session.courts) < 4) {
    return { ok: false, reason: 'Not enough active players for a court' }
  }
  return { ok: true }
}

/**
 * Rebuild the current round when it has no scores yet (late add / early leave).
 * Rolls back sit-out & partnership bumps from the old round, then regenerates.
 */
export function regenerateCurrentRound(session: Session): Session {
  if (session.status !== 'active') return session
  const idx = session.currentRoundIndex
  const old = session.rounds[idx]
  if (!old) return session
  if (currentRoundHasScores(session)) {
    throw new Error('Cannot regenerate — scores already entered')
  }

  const playCheck = canContinuePlay(session)
  if (!playCheck.ok) throw new Error(playCheck.reason)

  const partnerCounts = unrecordPartnerships(session.partnerCounts, old.matches)
  const sitOutCounts = unbumpSitOuts(session.sitOutCounts, old.sittingOut)
  const priorRounds = session.rounds.slice(0, idx)
  const draft: Session = {
    ...session,
    partnerCounts,
    sitOutCounts,
    rounds: priorRounds,
  }
  const generated = generatePlayRound(draft)
  const round = { ...generated, number: old.number }

  return {
    ...session,
    partnerCounts: recordPartnerships(partnerCounts, round.matches),
    sitOutCounts: bumpSitOuts(sitOutCounts, round.sittingOut),
    rounds: session.rounds.map((r, i) => (i === idx ? round : r)),
  }
}

/**
 * Bring back someone who left, keeping their id, differential, and history.
 * Unscored current round is rebuilt so they can play now; a scored round
 * keeps its lineup and they rejoin on the next round.
 */
export function reactivatePlayer(session: Session, playerId: string): RosterChangeResult {
  if (session.status === 'finished') {
    return { session, ok: false, reason: 'Session is finished' }
  }
  const player = session.players.find((p) => p.id === playerId)
  if (!player) return { session, ok: false, reason: 'Player not found' }
  if (isPlayerActive(player)) {
    return { session, ok: false, reason: 'That name is already in the list.' }
  }

  let next: Session = {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId ? { ...p, active: true } : p,
    ),
    scores: { ...session.scores, [playerId]: session.scores[playerId] ?? 0 },
    sitOutCounts: {
      ...session.sitOutCounts,
      [playerId]: session.sitOutCounts[playerId] ?? 0,
    },
  }

  if (session.status === 'setup') {
    return { session: next, ok: true, reason: `${player.name} is back` }
  }

  if (currentRoundHasScores(next)) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: `${player.name} is back — joins next round`,
    }
  }

  try {
    next = regenerateCurrentRound(next)
    return {
      session: next,
      ok: true,
      regenerated: true,
      reason: `${player.name} is back — round updated`,
    }
  } catch (e) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: e instanceof Error ? e.message : 'Brought back, but could not rebuild round',
    }
  }
}

/**
 * Add a player during setup or an active session.
 * Active + unscored current round → regenerate so they can play now.
 * Active + scored round → join roster for subsequent rounds only.
 * Adding the name of someone who left brings that same player back.
 */
export function addPlayer(session: Session, name: string): RosterChangeResult {
  const trimmed = name.trim()
  if (!trimmed) {
    return { session, ok: false, reason: 'Enter a name' }
  }
  if (session.status === 'finished') {
    return { session, ok: false, reason: 'Session is finished' }
  }

  const key = trimmed.toLowerCase()
  const left = session.players.find(
    (p) => p.active === false && p.name.trim().toLowerCase() === key,
  )
  if (left) {
    return reactivatePlayer(session, left.id)
  }

  if (session.players.length >= 16) {
    return { session, ok: false, reason: 'Max 16 players' }
  }
  if (isDuplicateName(session, trimmed)) {
    return { session, ok: false, reason: 'That name is already in the list.' }
  }

  const player: Player = {
    id: createId('player'),
    name: trimmed,
    active: true,
  }

  let next: Session = {
    ...session,
    players: [...session.players, player],
    scores: { ...session.scores, [player.id]: 0 },
    sitOutCounts: { ...session.sitOutCounts, [player.id]: 0 },
  }

  if (session.status === 'setup') {
    return { session: next, ok: true }
  }

  // Active session
  if (currentRoundHasScores(next)) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: `${trimmed} added — will join next round`,
    }
  }

  try {
    next = regenerateCurrentRound(next)
    return { session: next, ok: true, regenerated: true }
  } catch (e) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: e instanceof Error ? e.message : 'Added, but could not rebuild round',
    }
  }
}

/**
 * Mark a player as left for the rest of the session (keeps differential on standings).
 * Unscored current round is regenerated without them.
 * If any score is already in, they finish this round and drop out of the next one.
 */
export function leavePlayer(session: Session, playerId: string): RosterChangeResult {
  if (session.status === 'setup') {
    return { session: removePlayer(session, playerId), ok: true }
  }
  if (session.status !== 'active') {
    return { session, ok: false, reason: 'Can only remove during play' }
  }

  const player = session.players.find((p) => p.id === playerId)
  if (!player) return { session, ok: false, reason: 'Player not found' }
  if (!isPlayerActive(player)) {
    return { session, ok: false, reason: 'Already left' }
  }

  const activeCount = activePlayers(session).length
  if (activeCount <= 4) {
    return {
      session,
      ok: false,
      reason: 'Need at least 4 active players — end session or add someone first',
    }
  }

  let next: Session = {
    ...session,
    players: session.players.map((p) =>
      p.id === playerId ? { ...p, active: false } : p,
    ),
    sitRequests: {
      sit: (session.sitRequests?.sit ?? []).filter((id) => id !== playerId),
      play: (session.sitRequests?.play ?? []).filter((id) => id !== playerId),
    },
  }

  if (currentRoundHasScores(next)) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: `${player.name} left — out from the next round`,
    }
  }

  try {
    next = regenerateCurrentRound(next)
    return { session: next, ok: true, regenerated: true }
  } catch (e) {
    return {
      session,
      ok: false,
      reason: e instanceof Error ? e.message : 'Could not rebuild round',
    }
  }
}

/** Start session and generate the first round */
export function startSession(session: Session): Session {
  const check = canStart(session)
  if (!check.ok) throw new Error(check.reason)

  const players = session.players.map((p) => ({ ...p, active: p.active !== false }))

  let next: Session = {
    ...session,
    players,
    status: 'active',
    phase: 'americano',
    kingsCourtSeed: session.kingsCourtSeed === 'random' ? 'random' : 'standings',
    rounds: [],
    currentRoundIndex: 0,
    scoreLog: [],
    recapScript: undefined,
    sitRequests: emptySitRequests(),
    partnerCounts: {},
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
  }

  const round = generateNextRound(next)
  next = {
    ...next,
    rounds: [round],
    currentRoundIndex: 0,
    partnerCounts: recordPartnerships({}, round.matches),
    sitOutCounts: bumpSitOuts(next.sitOutCounts, round.sittingOut),
  }
  return next
}

function generatePlayRound(session: Session): Round {
  if (session.phase === 'kingsCourt') {
    return generateKingsCourtRound(session)
  }
  return generateNextRound(session)
}

export function advanceToNextRound(session: Session): Session {
  if (session.status !== 'active') return session
  const check = canContinuePlay(session)
  if (!check.ok) throw new Error(check.reason)
  const round = generatePlayRound(session)
  return {
    ...session,
    sitRequests: emptySitRequests(),
    rounds: [...session.rounds, round],
    currentRoundIndex: session.rounds.length,
    partnerCounts: recordPartnerships(session.partnerCounts, round.matches),
    sitOutCounts: bumpSitOuts(session.sitOutCounts, round.sittingOut),
  }
}

/**
 * Sit / unsit a player for the current (unscored) or next (scored) round.
 * They stay in the session — this is not “left early”.
 */
export function toggleSit(session: Session, playerId: string): RosterChangeResult {
  if (session.status !== 'active') {
    return { session, ok: false, reason: 'Can only sit during play' }
  }
  const player = session.players.find((p) => p.id === playerId)
  if (!player) return { session, ok: false, reason: 'Player not found' }
  if (!isPlayerActive(player)) {
    return { session, ok: false, reason: 'Player already left' }
  }

  const state = playerSitState(session, playerId)
  const wantSit = !state.highlight
  const req = normalizeSitRequests(session.sitRequests)
  const sit = new Set(req.sit)
  const play = new Set(req.play)

  if (wantSit) {
    sit.add(playerId)
    play.delete(playerId)
  } else {
    sit.delete(playerId)
    play.add(playerId)
  }

  const nextRequests = { sit: [...sit], play: [...play] }
  const active = activePlayers(session)
  if (wantSit && !canFieldCourtAfterSits(active.length, session.courts, nextRequests.sit)) {
    return {
      session,
      ok: false,
      reason: 'Need at least 4 players on court — unsit someone first',
    }
  }

  const next: Session = { ...session, sitRequests: nextRequests }

  if (currentRoundHasScores(next)) {
    return {
      session: next,
      ok: true,
      regenerated: false,
      reason: wantSit
        ? `${player.name} will sit next round`
        : `${player.name} will play next round`,
    }
  }

  try {
    const regenerated = regenerateCurrentRound(next)
    return {
      session: regenerated,
      ok: true,
      regenerated: true,
    }
  } catch (e) {
    return {
      session,
      ok: false,
      reason: e instanceof Error ? e.message : 'Could not rebuild round',
    }
  }
}

function matchHasEnteredScore(match: Match): boolean {
  return match.scoreA !== null || match.scoreB !== null
}

type LineupSlot =
  | { kind: 'court'; matchIndex: number; team: 'A' | 'B'; index: 0 | 1 }
  | { kind: 'sit'; index: number }

function findLineupSlot(round: Round, playerId: string): LineupSlot | null {
  for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
    const match = round.matches[matchIndex]!
    const a = match.teamA.indexOf(playerId)
    if (a === 0 || a === 1) return { kind: 'court', matchIndex, team: 'A', index: a }
    const b = match.teamB.indexOf(playerId)
    if (b === 0 || b === 1) return { kind: 'court', matchIndex, team: 'B', index: b }
  }
  const sitIndex = round.sittingOut.indexOf(playerId)
  if (sitIndex >= 0) return { kind: 'sit', index: sitIndex }
  return null
}

function playerAt(round: Round, slot: LineupSlot): string {
  if (slot.kind === 'sit') return round.sittingOut[slot.index]!
  const match = round.matches[slot.matchIndex]!
  return slot.team === 'A' ? match.teamA[slot.index] : match.teamB[slot.index]
}

function writeSlot(round: Round, slot: LineupSlot, playerId: string): Round {
  if (slot.kind === 'sit') {
    return {
      ...round,
      sittingOut: round.sittingOut.map((id, i) => (i === slot.index ? playerId : id)),
    }
  }
  return {
    ...round,
    matches: round.matches.map((match, i) => {
      if (i !== slot.matchIndex) return match
      if (slot.team === 'A') {
        const teamA: [string, string] = [match.teamA[0], match.teamA[1]]
        teamA[slot.index] = playerId
        return { ...match, teamA }
      }
      const teamB: [string, string] = [match.teamB[0], match.teamB[1]]
      teamB[slot.index] = playerId
      return { ...match, teamB }
    }),
  }
}

function lockedCourtMessage(round: Round, slot: LineupSlot): string | null {
  if (slot.kind !== 'court') return null
  const match = round.matches[slot.matchIndex]
  if (!match || !matchHasEnteredScore(match)) return null
  return `Court ${match.court} already has a score. Use Edit score instead of swapping.`
}

/**
 * Swap two players in the current round: court ↔ court (including partners
 * on the same court) or court ↔ sitting. Scored matches stay locked.
 * Sit-out counts and partner history follow the lineup that will actually play.
 */
export function swapPlayers(
  session: Session,
  playerAId: string,
  playerBId: string,
): RosterChangeResult {
  if (session.status !== 'active') {
    return { session, ok: false, reason: 'Can only swap during play' }
  }
  if (playerAId === playerBId) {
    return { session, ok: true }
  }

  const idx = session.currentRoundIndex
  const round = session.rounds[idx]
  if (!round) return { session, ok: false, reason: 'No round loaded' }

  const slotA = findLineupSlot(round, playerAId)
  const slotB = findLineupSlot(round, playerBId)
  if (!slotA || !slotB) {
    return { session, ok: false, reason: "That player isn't in this round." }
  }
  if (slotA.kind === 'sit' && slotB.kind === 'sit') {
    return { session, ok: false, reason: 'Both players are sitting. Tap someone on court.' }
  }

  const locked =
    lockedCourtMessage(round, slotA) ?? lockedCourtMessage(round, slotB)
  if (locked) {
    return { session, ok: false, reason: locked }
  }

  const idA = playerAt(round, slotA)
  const idB = playerAt(round, slotB)
  let nextRound = writeSlot(round, slotA, idB)
  nextRound = writeSlot(nextRound, slotB, idA)

  const matchIndexes = new Set<number>()
  if (slotA.kind === 'court') matchIndexes.add(slotA.matchIndex)
  if (slotB.kind === 'court') matchIndexes.add(slotB.matchIndex)
  const oldMatches = [...matchIndexes].map((i) => round.matches[i]!)
  const newMatches = [...matchIndexes].map((i) => nextRound.matches[i]!)

  let partnerCounts = unrecordPartnerships(session.partnerCounts, oldMatches)
  partnerCounts = recordPartnerships(partnerCounts, newMatches)

  const oldSit = new Set(round.sittingOut)
  const newSit = new Set(nextRound.sittingOut)
  const leftBench = [...oldSit].filter((id) => !newSit.has(id))
  const joinedBench = [...newSit].filter((id) => !oldSit.has(id))
  let sitOutCounts = unbumpSitOuts(session.sitOutCounts, leftBench)
  sitOutCounts = bumpSitOuts(sitOutCounts, joinedBench)

  const nameA = session.players.find((p) => p.id === playerAId)?.name ?? 'Player'
  const nameB = session.players.find((p) => p.id === playerBId)?.name ?? 'Player'

  return {
    session: {
      ...session,
      partnerCounts,
      sitOutCounts,
      rounds: session.rounds.map((r, i) => (i === idx ? nextRound : r)),
    },
    ok: true,
    reason: `Swapped ${nameA} and ${nameB}`,
  }
}

export function canSwitchToKingsCourt(session: Session): { ok: boolean; reason?: string } {
  if (session.status !== 'active') {
    return { ok: false, reason: 'Start a session first' }
  }
  if (session.phase === 'kingsCourt') {
    return { ok: false, reason: 'Already in King’s Court' }
  }
  const play = canContinuePlay(session)
  if (!play.ok) return play
  if (currentRoundHasScores(session) && !isRoundComplete(session, session.currentRoundIndex)) {
    return { ok: false, reason: 'Finish or undo scores in this round first' }
  }
  return { ok: true }
}

/**
 * Flip an active Americano session into a King’s Court finish.
 * Unscored current round is replaced; a completed round is followed by a new KC round.
 */
export function switchToKingsCourt(
  session: Session,
  seed: KingsCourtSeed = 'standings',
): Session {
  const check = canSwitchToKingsCourt(session)
  if (!check.ok) throw new Error(check.reason)

  const nextPhase: Session = {
    ...session,
    phase: 'kingsCourt',
    kingsCourtSeed: seed === 'random' ? 'random' : 'standings',
  }

  const idx = nextPhase.currentRoundIndex
  const current = nextPhase.rounds[idx]
  const scored = currentRoundHasScores(nextPhase)
  const complete = current ? isRoundComplete(nextPhase, idx) : true

  if (current && !scored) {
    const partnerCounts = unrecordPartnerships(nextPhase.partnerCounts, current.matches)
    const sitOutCounts = unbumpSitOuts(nextPhase.sitOutCounts, current.sittingOut)
    const priorRounds = nextPhase.rounds.slice(0, idx)
    const draft: Session = {
      ...nextPhase,
      partnerCounts,
      sitOutCounts,
      rounds: priorRounds,
    }
    const generated = generateKingsCourtRound(draft)
    const round = { ...generated, number: current.number }
    return {
      ...nextPhase,
      partnerCounts: recordPartnerships(partnerCounts, round.matches),
      sitOutCounts: bumpSitOuts(sitOutCounts, round.sittingOut),
      rounds: nextPhase.rounds.map((r, i) => (i === idx ? round : r)),
    }
  }

  if (!current || complete) {
    const round = generateKingsCourtRound(nextPhase)
    return {
      ...nextPhase,
      rounds: [...nextPhase.rounds, round],
      currentRoundIndex: nextPhase.rounds.length,
      partnerCounts: recordPartnerships(nextPhase.partnerCounts, round.matches),
      sitOutCounts: bumpSitOuts(nextPhase.sitOutCounts, round.sittingOut),
    }
  }

  throw new Error('Finish or undo scores in this round first')
}

function lastCompletedKingsCourtIndex(session: Session): number {
  for (let i = session.rounds.length - 1; i >= 0; i--) {
    const round = session.rounds[i]!
    if (round.kind !== 'kingsCourt') continue
    if (isRoundComplete(session, i)) return i
  }
  return -1
}

/**
 * After a score correction, rebuild the current King’s Court round when it
 * still has no scores and still depends on the edited round:
 * - later KC round, previous KC complete → movement from corrected winners/losers
 * - first KC round, standings seed → re-seed from corrected Americano standings
 *
 * If the next KC round already has scores, pairings stay put (standings +
 * differential still update via editScore). Random-seeded first KC is not reshuffled.
 */
function rebuildKingsCourtAfterScoreEdit(
  session: Session,
  editedRoundIndex: number,
  winnerFlipped: boolean,
): Session {
  if (session.status !== 'active') return session
  if (session.phase !== 'kingsCourt') return session

  const idx = session.currentRoundIndex
  if (editedRoundIndex >= idx) return session

  const current = session.rounds[idx]
  if (!current || current.kind !== 'kingsCourt') return session
  if (currentRoundHasScores(session)) return session

  const lastKc = lastCompletedKingsCourtIndex(session)
  if (lastKc >= 0) {
    if (editedRoundIndex !== lastKc || !winnerFlipped) return session
    try {
      return regenerateCurrentRound(session)
    } catch {
      return session
    }
  }

  // First KC ladder: only re-seed from standings (random would reshuffle courts).
  if (session.kingsCourtSeed === 'random') return session
  try {
    return regenerateCurrentRound(session)
  } catch {
    return session
  }
}

/**
 * Replace a scored match. Always recomputes wins / differential / standings.
 * Rebuilds the current unscored King’s Court ladder from the corrected round
 * when that round still drives placement (see rebuildKingsCourtAfterScoreEdit).
 */
export function editMatchScore(
  session: Session,
  roundIndex: number,
  matchId: string,
  scoreA: number,
  scoreB: number,
): Session {
  const match = session.rounds[roundIndex]?.matches.find((m) => m.id === matchId)
  if (!match || !isMatchComplete(match) || match.scoreA === null || match.scoreB === null) {
    return editScore(session, roundIndex, matchId, scoreA, scoreB)
  }
  const winnerFlipped = matchWinnerFlipped(match.scoreA, match.scoreB, scoreA, scoreB)
  const next = editScore(session, roundIndex, matchId, scoreA, scoreB)
  if (next === session) return session
  return rebuildKingsCourtAfterScoreEdit(next, roundIndex, winnerFlipped)
}

/** Enter a new score or replace an existing one for this court. */
export function saveMatchScore(
  session: Session,
  roundIndex: number,
  matchId: string,
  scoreA: number,
  scoreB: number,
): Session {
  const match = session.rounds[roundIndex]?.matches.find((m) => m.id === matchId)
  if (match && isMatchComplete(match)) {
    return editMatchScore(session, roundIndex, matchId, scoreA, scoreB)
  }
  return applyScore(session, roundIndex, matchId, scoreA, scoreB)
}

export function setMatchComment(
  session: Session,
  roundIndex: number,
  matchId: string,
  comment: string,
): Session {
  const trimmed = comment.trim().slice(0, 280)
  const rounds = session.rounds.map((r, i) => {
    if (i !== roundIndex) return r
    return {
      ...r,
      matches: r.matches.map((m) =>
        m.id === matchId ? { ...m, comment: trimmed || undefined } : m,
      ),
    }
  })
  return { ...session, rounds }
}

export function setRoundNote(session: Session, roundIndex: number, note: string): Session {
  const trimmed = note.trim().slice(0, 200)
  const rounds = session.rounds.map((r, i) =>
    i === roundIndex ? { ...r, note: trimmed || undefined } : r,
  )
  return { ...session, rounds }
}

export function setRecapScript(session: Session, script: string): Session {
  const trimmed = script.trim()
  return { ...session, recapScript: trimmed || undefined }
}

export function endSession(session: Session): Session {
  return { ...session, status: 'finished' }
}

/** Re-open a finished session so more rounds can be played. */
export function reopenSession(session: Session): Session {
  if (session.rounds.length === 0) return session
  return { ...session, status: 'active' }
}

export function resetToSetup(session: Session): Session {
  // Rematch: bring everyone back (including those who left early)
  return {
    ...createEmptySession(),
    players: session.players.map((p) => ({
      id: p.id,
      name: p.name,
      active: true,
    })),
    courts: session.courts,
    pointsToWin: session.pointsToWin,
    winBy: session.winBy ?? 2,
    phase: 'americano',
    kingsCourtSeed: 'standings',
  }
}

export function normalizeSession(parsed: Session): Session {
  const winBy: WinBy = parsed.winBy === 1 ? 1 : 2
  const pointsToWin =
    typeof parsed.pointsToWin === 'number' && parsed.pointsToWin > 0
      ? parsed.pointsToWin
      : 11
  const players = (Array.isArray(parsed.players) ? parsed.players : []).map((p) => ({
    ...p,
    active: p.active !== false,
  }))
  const rounds = (Array.isArray(parsed.rounds) ? parsed.rounds : []).map((r) => ({
    ...r,
    kind: r.kind === 'kingsCourt' ? ('kingsCourt' as const) : r.kind === 'americano' ? ('americano' as const) : undefined,
  }))
  const normalized: Session = {
    ...parsed,
    winBy,
    pointsToWin,
    players,
    phase: parsed.phase === 'kingsCourt' ? 'kingsCourt' : 'americano',
    kingsCourtSeed: parsed.kingsCourtSeed === 'random' ? 'random' : 'standings',
    sitRequests: normalizeSitRequests(parsed.sitRequests),
    rounds,
    scores: parsed.scores ?? {},
    sitOutCounts: parsed.sitOutCounts ?? {},
    partnerCounts: parsed.partnerCounts ?? {},
    scoreLog: Array.isArray(parsed.scoreLog) ? parsed.scoreLog : [],
    courts: typeof parsed.courts === 'number' ? parsed.courts : 2,
    currentRoundIndex:
      typeof parsed.currentRoundIndex === 'number' ? parsed.currentRoundIndex : 0,
    status: parsed.status === 'active' || parsed.status === 'finished' ? parsed.status : 'setup',
    recapScript: typeof parsed.recapScript === 'string' ? parsed.recapScript : undefined,
  }
  // Rebuild differentials from match scores so old “banked points” sessions migrate.
  return recomputeScoresFromMatches(normalized)
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore quota / private mode
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.id || !Array.isArray(parsed.players)) return null
    return normalizeSession(parsed)
  } catch {
    return null
  }
}

export function clearSavedSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

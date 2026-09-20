import { createId } from './ids'
import { activePlayers, chooseSitOuts, pickSitOutsFrom } from './schedule'
import { computeStandings, isMatchComplete, playerName } from './scoring'
import type {
  KingsCourtSeed,
  Match,
  Player,
  Round,
  Session,
} from './types'

export type Pair = [string, string]

export interface CourtGroups {
  court: number
  /** Pair that splits as opponents (winners arriving / staying). */
  groupA: Pair
  /** The other arriving pair — also splits as opponents. */
  groupB: Pair
}

export function isKingsCourtRound(round: Round): boolean {
  return round.kind === 'kingsCourt'
}

export function usedKingsCourt(session: Session): boolean {
  return session.phase === 'kingsCourt' || session.rounds.some(isKingsCourtRound)
}

export function kingsCourtRoundCount(session: Session): number {
  return session.rounds.filter(isKingsCourtRound).length
}

export function courtTitle(court: number): string {
  return court === 1 ? 'Court 1 · King’s' : `Court ${court}`
}

/** How many courts this King’s Court round is actually using. */
export function kingsCourtMatchCourts(session: Session): number {
  const round = session.rounds[session.currentRoundIndex]
  if (round && isKingsCourtRound(round) && round.matches.length > 0) {
    return round.matches.length
  }
  const players = activePlayers(session).length
  return Math.min(session.courts, Math.floor(players / 4))
}

/**
 * Plain-language “who goes where” for a court, before or after scores.
 */
export function courtMovementHint(court: number, courtCount: number): string {
  if (courtCount <= 1) {
    return 'Winners stay and split · Losers stay and split'
  }
  const up = court === 1 ? 'Winners stay' : `Winners → Court ${court - 1}`
  const down = court === courtCount ? 'Losers stay' : `Losers → Court ${court + 1}`
  return `${up} · ${down}`
}

/** After a score is in: name the movers. */
export function describeMatchMovement(
  match: Match,
  courtCount: number,
  players: Player[],
): string | null {
  if (!isMatchComplete(match)) return null
  const { winners, losers } = matchWinnersLosers(match)
  const w = `${playerName(players, winners[0])} & ${playerName(players, winners[1])}`
  const l = `${playerName(players, losers[0])} & ${playerName(players, losers[1])}`
  if (courtCount <= 1) {
    return `${w} stay on King’s and split. ${l} stay and split.`
  }
  const winDest =
    match.court === 1
      ? 'stay on King’s (they’ll split)'
      : `→ Court ${match.court - 1} (they’ll split)`
  const loseDest =
    match.court === courtCount ? 'stay and split' : `→ Court ${match.court + 1} (they’ll split)`
  return `${w} ${winDest}. ${l} ${loseDest}.`
}

export function matchWinnersLosers(match: Match): { winners: Pair; losers: Pair } {
  if (match.scoreA === null || match.scoreB === null) {
    throw new Error('Match is not scored')
  }
  if (match.scoreA === match.scoreB) {
    throw new Error('Match is tied')
  }
  if (match.scoreA > match.scoreB) {
    return { winners: match.teamA, losers: match.teamB }
  }
  return { winners: match.teamB, losers: match.teamA }
}

/**
 * Mandatory partner split: each arriving pair becomes opponents.
 * Pairing is deterministic (ids sorted within each pair).
 */
export function splitPartnersIntoOpponents(
  groupA: Pair,
  groupB: Pair,
): { teamA: Pair; teamB: Pair } {
  const a = [...groupA].sort() as Pair
  const b = [...groupB].sort() as Pair
  return {
    teamA: [a[0], b[0]],
    teamB: [a[1], b[1]],
  }
}

/** Seed pairing on a court of 4 ranked 1–4: 1+4 vs 2+3. */
export function seedCourtPairing(rankedIds: string[]): { teamA: Pair; teamB: Pair } {
  if (rankedIds.length !== 4) {
    throw new Error('seedCourtPairing requires exactly 4 players')
  }
  return {
    teamA: [rankedIds[0]!, rankedIds[3]!],
    teamB: [rankedIds[1]!, rankedIds[2]!],
  }
}

/**
 * Next-round court groups from completed matches (court 1 = King’s).
 * Court 1: C1 winners + C2 winners (or C1 winners + C1 losers if one court).
 * Middle k: C(k-1) losers + C(k+1) winners.
 * Court N: C(N-1) losers + CN losers.
 */
export function nextCourtGroups(matches: Match[]): CourtGroups[] {
  const sorted = [...matches].sort((a, b) => a.court - b.court)
  if (sorted.length === 0) return []
  const results = sorted.map((m) => ({ court: m.court, ...matchWinnersLosers(m) }))
  const n = results.length

  if (n === 1) {
    return [
      {
        court: 1,
        groupA: results[0]!.winners,
        groupB: results[0]!.losers,
      },
    ]
  }

  const groups: CourtGroups[] = []
  for (let i = 0; i < n; i++) {
    const court = i + 1
    if (i === 0) {
      groups.push({
        court,
        groupA: results[0]!.winners,
        groupB: results[1]!.winners,
      })
    } else if (i === n - 1) {
      groups.push({
        court,
        groupA: results[n - 2]!.losers,
        groupB: results[n - 1]!.losers,
      })
    } else {
      groups.push({
        court,
        groupA: results[i - 1]!.losers,
        groupB: results[i + 1]!.winners,
      })
    }
  }
  return groups
}

/** Active players ordered for the first King’s Court ladder. */
/** Active players in standings order (wins, then differential). */
export function seedPlayersFromStandings(session: Session): Player[] {
  const byId = new Map(session.players.map((p) => [p.id, p]))
  return computeStandings(session)
    .filter((s) => s.active)
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => Boolean(p))
}

export function shufflePlayers(players: Player[], rng: () => number = Math.random): Player[] {
  const a = [...players]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

function targetCourtCount(session: Session): number {
  const n = activePlayers(session).length
  const courts = Math.min(session.courts, Math.floor(n / 4))
  if (courts < 1) throw new Error('Not enough active players for a court')
  return courts
}

function makeMatch(court: number, paired: { teamA: Pair; teamB: Pair }): Match {
  return {
    id: createId('match'),
    court,
    teamA: paired.teamA,
    teamB: paired.teamB,
    scoreA: null,
    scoreB: null,
  }
}

function pairCourt(
  groupA: string[],
  groupB: string[],
  session: Session,
): { teamA: Pair; teamB: Pair } {
  if (groupA.length === 2 && groupB.length === 2) {
    return splitPartnersIntoOpponents([groupA[0]!, groupA[1]!], [groupB[0]!, groupB[1]!])
  }
  const four = [...groupA, ...groupB]
  const ordered = seedPlayersFromStandings(session)
    .map((p) => p.id)
    .filter((id) => four.includes(id))
  const rest = four.filter((id) => !ordered.includes(id))
  const ids = [...ordered, ...rest]
  if (ids.length !== 4) {
    throw new Error(`Cannot pair court with ${ids.length} players`)
  }
  return seedCourtPairing(ids)
}

function rebuildTwoGroups(
  four: string[],
  preferredA: string[],
  preferredB: string[],
): [string[], string[]] {
  const a = preferredA.filter((id) => four.includes(id))
  const b = preferredB.filter((id) => four.includes(id))
  const rest = four.filter((id) => !a.includes(id) && !b.includes(id))
  for (const id of rest) {
    if (a.length <= b.length && a.length < 2) a.push(id)
    else if (b.length < 2) b.push(id)
    else a.push(id)
  }
  while (a.length > 2) b.push(a.pop()!)
  while (b.length > 2) a.push(b.pop()!)
  return [a.slice(0, 2), b.slice(0, 2)]
}

function sortBenchForEntry(ids: string[], session: Session): string[] {
  const standings = computeStandings(session)
  const rank = new Map(standings.map((s) => [s.playerId, s.rank]))
  return [...ids].sort((a, b) => {
    const sa = session.sitOutCounts[a] ?? 0
    const sb = session.sitOutCounts[b] ?? 0
    if (sa !== sb) return sb - sa
    const ra = rank.get(a) ?? 99
    const rb = rank.get(b) ?? 99
    if (ra !== rb) return rb - ra
    return a.localeCompare(b)
  })
}

function pickSitsHonoringRequests(
  poolPlayers: Player[],
  needed: number,
  sitOutCounts: Record<string, number>,
  reqSit: Set<string>,
  reqPlay: Set<string>,
): string[] {
  if (needed <= 0) return []
  const forced = poolPlayers.filter((p) => reqSit.has(p.id)).map((p) => p.id)
  if (forced.length >= needed) return forced.slice(0, needed)
  const rest = pickSitOutsFrom(
    poolPlayers.filter((p) => !reqSit.has(p.id) && !reqPlay.has(p.id)),
    needed - forced.length,
    sitOutCounts,
  )
  const sitting = [...forced, ...rest]
  if (sitting.length < needed) {
    sitting.push(
      ...pickSitOutsFrom(
        poolPlayers.filter((p) => !sitting.includes(p.id)),
        needed - sitting.length,
        sitOutCounts,
      ),
    )
  }
  return sitting
}

function lastCompletedKingsCourtRound(session: Session): Round | null {
  for (let i = session.rounds.length - 1; i >= 0; i--) {
    const round = session.rounds[i]!
    if (!isKingsCourtRound(round)) continue
    if (round.matches.length > 0 && round.matches.every(isMatchComplete)) {
      return round
    }
  }
  return null
}

function generateFromSeed(session: Session, rng: () => number): Round {
  const seed: KingsCourtSeed = session.kingsCourtSeed === 'random' ? 'random' : 'standings'
  const active = activePlayers(session)
  const ordered =
    seed === 'random' ? shufflePlayers(active, rng) : seedPlayersFromStandings(session)
  const hasSitRequests =
    (session.sitRequests?.sit.length ?? 0) > 0 || (session.sitRequests?.play.length ?? 0) > 0
  const sittingOut = hasSitRequests
    ? chooseSitOuts(active, session.courts, session.sitOutCounts, session.sitRequests)
    : null
  const sitSet = new Set(sittingOut ?? [])
  const playing = sittingOut
    ? ordered.filter((p) => !sitSet.has(p.id))
    : ordered
  const courts = sittingOut
    ? Math.min(session.courts, Math.floor(playing.length / 4))
    : targetCourtCount(session)
  if (courts < 1) {
    throw new Error('Not enough active players for a court')
  }
  const slots = courts * 4
  if (playing.length < slots) {
    throw new Error('Not enough active players for a court')
  }
  const onCourt = playing.slice(0, slots)
  const resolvedSitting = sittingOut ?? playing.slice(slots).map((p) => p.id)
  const matches: Match[] = []
  for (let c = 0; c < courts; c++) {
    const four = onCourt.slice(c * 4, c * 4 + 4).map((p) => p.id)
    matches.push(makeMatch(c + 1, seedCourtPairing(four)))
  }

  return {
    number: session.rounds.length + 1,
    matches,
    sittingOut: resolvedSitting,
    kind: 'kingsCourt',
  }
}

function generateFromMovement(session: Session, prev: Round): Round {
  const players = activePlayers(session)
  const activeIds = new Set(players.map((p) => p.id))
  const courts = targetCourtCount(session)
  const rawGroups = nextCourtGroups(prev.matches)

  type Loose = { court: number; groupA: string[]; groupB: string[] }
  let ladder: Loose[] = rawGroups.map((g) => ({
    court: g.court,
    groupA: g.groupA.filter((id) => activeIds.has(id)),
    groupB: g.groupB.filter((id) => activeIds.has(id)),
  }))

  const assigned = new Set(ladder.flatMap((c) => [...c.groupA, ...c.groupB]))
  let bench = players.map((p) => p.id).filter((id) => !assigned.has(id))

  if (courts < ladder.length) {
    const dropped = ladder.filter((c) => c.court > courts)
    ladder = ladder.filter((c) => c.court <= courts)
    for (const d of dropped) bench.push(...d.groupA, ...d.groupB)
  }
  while (ladder.length < courts) {
    ladder.push({ court: ladder.length + 1, groupA: [], groupB: [] })
  }

  const reqSit = new Set(session.sitRequests?.sit ?? [])
  const reqPlay = new Set(
    (session.sitRequests?.play ?? []).filter((id) => !reqSit.has(id)),
  )

  // Manager sit: pull them off the ladder onto the bench.
  for (const c of ladder) {
    const take = (arr: string[]) => {
      const stay = arr.filter((id) => !reqSit.has(id))
      bench.push(...arr.filter((id) => reqSit.has(id)))
      return stay
    }
    c.groupA = take(c.groupA)
    c.groupB = take(c.groupB)
  }

  bench = sortBenchForEntry(bench, session)
  // Forced sits stay on the bench; don't fill upper courts with them.
  const fillBench = bench.filter((id) => !reqSit.has(id))
  bench = [...fillBench, ...bench.filter((id) => reqSit.has(id))]

  const takeFromBench = (dest: Loose) => {
    const idx = bench.findIndex((id) => !reqSit.has(id))
    if (idx < 0) return false
    const id = bench.splice(idx, 1)[0]!
    if (dest.groupA.length < 2) dest.groupA.push(id)
    else dest.groupB.push(id)
    return true
  }

  for (const c of ladder) {
    if (c.court === courts) continue
    while (c.groupA.length + c.groupB.length < 4 && bench.length > 0) {
      takeFromBench(c)
    }
  }

  const bottom = ladder.find((c) => c.court === courts)!
  const neededSits = players.length - courts * 4

  // One court: winners stay; sit-outs come from losers + bench (fewest sits).
  // Multiple courts: sit-outs come from the bottom court + bench only.
  let sittingOut: string[]
  if (courts === 1) {
    const protectedIds = [...bottom.groupA]
    const poolIds = [...bottom.groupB, ...bench].filter((id) => !protectedIds.includes(id))
    const poolPlayers = poolIds
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
    sittingOut = pickSitsHonoringRequests(
      poolPlayers,
      neededSits,
      session.sitOutCounts,
      reqSit,
      reqPlay,
    )
    const sitSet = new Set(sittingOut)
    const filling = poolIds.filter((id) => !sitSet.has(id))
    const four = [...protectedIds, ...filling]
    if (four.length !== 4) {
      throw new Error(`King’s Court: expected 4 on court, got ${four.length}`)
    }
    const [a, b] = rebuildTwoGroups(four, protectedIds, bottom.groupB)
    bottom.groupA = a
    bottom.groupB = b
  } else {
    const poolIds = [...bottom.groupA, ...bottom.groupB, ...bench]
    const poolPlayers = poolIds
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p))
    sittingOut = pickSitsHonoringRequests(
      poolPlayers,
      neededSits,
      session.sitOutCounts,
      reqSit,
      reqPlay,
    )
    const sitSet = new Set(sittingOut)
    const four = poolIds.filter((id) => !sitSet.has(id))
    if (four.length !== 4) {
      throw new Error(`King’s Court: expected 4 on bottom court, got ${four.length}`)
    }
    const [a, b] = rebuildTwoGroups(four, bottom.groupA, bottom.groupB)
    bottom.groupA = a
    bottom.groupB = b
  }

  const matches = ladder.map((c) => makeMatch(c.court, pairCourt(c.groupA, c.groupB, session)))

  return {
    number: session.rounds.length + 1,
    matches,
    sittingOut,
    kind: 'kingsCourt',
  }
}

/**
 * Generate the next King’s Court round.
 * Uses movement + partner-split when the previous KC round is complete;
 * otherwise seeds from standings (or random).
 */
export function generateKingsCourtRound(
  session: Session,
  options?: { rng?: () => number },
): Round {
  const players = activePlayers(session)
  if (players.length < 4) {
    throw new Error('Need at least 4 active players')
  }
  const prev = lastCompletedKingsCourtRound(session)
  if (prev) {
    return generateFromMovement(session, prev)
  }
  return generateFromSeed(session, options?.rng ?? Math.random)
}

import { createId, pairKey } from './ids'
import type { Match, Player, Round, Session, SitRequests } from './types'

export function emptySitRequests(): SitRequests {
  return { sit: [], play: [] }
}

export function normalizeSitRequests(raw: SitRequests | undefined): SitRequests {
  const sit = Array.isArray(raw?.sit) ? [...new Set(raw.sit.filter((id) => typeof id === 'string'))] : []
  const play = Array.isArray(raw?.play)
    ? [...new Set(raw.play.filter((id) => typeof id === 'string' && !sit.includes(id)))]
    : []
  return { sit, play }
}

export function isPlayerActive(player: Player): boolean {
  return player.active !== false
}

export function activePlayers(session: Session): Player[] {
  return session.players.filter(isPlayerActive)
}

/** How many players can play given courts and roster size */
export function playingSlots(playerCount: number, courts: number): number {
  const maxByCourts = courts * 4
  const maxByRoster = Math.floor(playerCount / 4) * 4
  return Math.min(maxByCourts, maxByRoster)
}

export function sitOutCount(playerCount: number, courts: number): number {
  return playerCount - playingSlots(playerCount, courts)
}

/** Plain-language sit-out preview for setup / roster (empty if none). */
export function sitOutHint(playerCount: number, courts: number): string | null {
  const n = sitOutCount(playerCount, courts)
  if (n <= 0 || playerCount < 4) return null
  const who = n === 1 ? '1 sits' : `${n} sit`
  return `With ${playerCount} players / ${courts} court${courts === 1 ? '' : 's'}, ${who} each round — rotated fairly.`
}

/**
 * Pick `needed` sitters from a candidate pool: fewest sit-outs first, then id.
 */
export function pickSitOutsFrom(
  candidates: Player[],
  needed: number,
  sitOutCounts: Record<string, number>,
): string[] {
  if (needed <= 0 || candidates.length === 0) return []

  const sorted = [...candidates].sort((a, b) => {
    const sa = sitOutCounts[a.id] ?? 0
    const sb = sitOutCounts[b.id] ?? 0
    if (sa !== sb) return sa - sb
    return a.id.localeCompare(b.id)
  })
  return sorted.slice(0, Math.min(needed, sorted.length)).map((p) => p.id)
}

/**
 * Choose who sits out this round: prefer players with fewest sit-outs so far.
 * Tie-break by id for stability.
 */
/**
 * Choose sit-outs, honoring manager sit/play requests.
 * Forced sits come first; remaining byes go to fewest sits (skipping `play`).
 * Extra forced sits drop a court when needed so the on-court count stays a multiple of 4.
 */
export function chooseSitOuts(
  players: Player[],
  courts: number,
  sitOutCounts: Record<string, number>,
  requests?: SitRequests | null,
): string[] {
  const idSet = new Set(players.map((p) => p.id))
  const forceSit = [...new Set((requests?.sit ?? []).filter((id) => idSet.has(id)))]
  const forcePlay = new Set(
    (requests?.play ?? []).filter((id) => idSet.has(id) && !forceSit.includes(id)),
  )

  const sitting = [...forceSit]
  const available = players.length - sitting.length
  const playing = Math.min(courts * 4, Math.floor(available / 4) * 4)
  if (playing < 4) {
    return pickSitOutsFrom(
      players.filter((p) => !forcePlay.has(p.id)),
      sitOutCount(players.length, courts),
      sitOutCounts,
    )
  }

  const targetSit = players.length - playing
  const more = Math.max(0, targetSit - sitting.length)
  const candidates = players.filter((p) => !sitting.includes(p.id) && !forcePlay.has(p.id))
  sitting.push(...pickSitOutsFrom(candidates, more, sitOutCounts))
  if (sitting.length < targetSit) {
    const fallback = players.filter((p) => !sitting.includes(p.id))
    sitting.push(...pickSitOutsFrom(fallback, targetSit - sitting.length, sitOutCounts))
  }
  return sitting
}

/** True if sitting these extra people still leaves a full court. */
export function canFieldCourtAfterSits(
  playerCount: number,
  courts: number,
  sitIds: string[],
): boolean {
  const available = playerCount - new Set(sitIds).size
  return Math.min(courts * 4, Math.floor(available / 4) * 4) >= 4
}

type Pair = [string, string]

export function partnerKeysFromMatches(matches: Match[]): Set<string> {
  const keys = new Set<string>()
  for (const m of matches) {
    keys.add(pairKey(m.teamA[0], m.teamA[1]))
    keys.add(pairKey(m.teamB[0], m.teamB[1]))
  }
  return keys
}

/** Most recent rounds first (index 0 = last played / last generated). */
export function recentPartnerSets(session: Session, depth = 3): Set<string>[] {
  const sets: Set<string>[] = []
  for (let i = session.rounds.length - 1; i >= 0 && sets.length < depth; i--) {
    sets.push(partnerKeysFromMatches(session.rounds[i]!.matches))
  }
  return sets
}

/**
 * Partner cost: lifetime repeats, with a heavy penalty for last-round partners
 * and a decaying penalty for other recent partners.
 */
export function pairCost(
  a: string,
  b: string,
  partnerCounts: Record<string, number>,
  recent: Set<string>[] = [],
): number {
  const key = pairKey(a, b)
  let cost = (partnerCounts[key] ?? 0) * 10
  if (recent[0]?.has(key)) cost += 1000
  if (recent[1]?.has(key)) cost += 250
  if (recent[2]?.has(key)) cost += 80
  return cost
}

/**
 * Build doubles teams from 4k players, minimizing repeat partnerships.
 * Uses a greedy matching: repeatedly pick the unused pair with lowest prior partner count.
 */
export function buildTeams(
  playerIds: string[],
  partnerCounts: Record<string, number>,
  recent: Set<string>[] = [],
): Pair[] {
  if (playerIds.length % 2 !== 0) {
    throw new Error('buildTeams requires an even number of players')
  }

  const remaining = new Set(playerIds)
  const teams: Pair[] = []

  while (remaining.size > 0) {
    const ids = [...remaining]
    let best: Pair | null = null
    let bestCost = Infinity

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const cost = pairCost(ids[i]!, ids[j]!, partnerCounts, recent)
        if (
          cost < bestCost ||
          (cost === bestCost &&
            best !== null &&
            pairKey(ids[i]!, ids[j]!) < pairKey(best[0], best[1]))
        ) {
          bestCost = cost
          best = [ids[i]!, ids[j]!]
        }
      }
    }

    if (!best) break
    teams.push(best)
    remaining.delete(best[0])
    remaining.delete(best[1])
  }

  return teams
}

/** All perfect matchings (partner pairings). Feasible for ≤12 players. */
export function enumeratePerfectMatchings(ids: string[]): Pair[][] {
  if (ids.length === 0) return [[]]
  if (ids.length % 2 !== 0) {
    throw new Error('enumeratePerfectMatchings requires an even number of players')
  }
  const first = ids[0]!
  const rest = ids.slice(1)
  const out: Pair[][] = []
  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i]!
    const remaining = rest.filter((_, j) => j !== i)
    for (const tail of enumeratePerfectMatchings(remaining)) {
      out.push([[first, partner], ...tail])
    }
  }
  return out
}

function matchingSortKey(teams: Pair[]): string {
  return teams
    .map(([a, b]) => pairKey(a, b))
    .sort()
    .join(';')
}

/**
 * Best partner matching: enumerate when the pool is small so last-round
 * rematches are avoided whenever any alternative exists.
 */
export function bestPartnerMatching(
  playerIds: string[],
  partnerCounts: Record<string, number>,
  recent: Set<string>[] = [],
): Pair[] {
  if (playerIds.length % 2 !== 0) {
    throw new Error('bestPartnerMatching requires an even number of players')
  }
  if (playerIds.length === 0) return []

  if (playerIds.length <= 12) {
    let best: Pair[] | null = null
    let bestCost = Infinity
    let bestKey = ''
    for (const matching of enumeratePerfectMatchings(playerIds)) {
      const cost = totalPartnerCost(matching, partnerCounts, recent)
      const key = matchingSortKey(matching)
      if (cost < bestCost || (cost === bestCost && key < bestKey)) {
        bestCost = cost
        bestKey = key
        best = matching
      }
    }
    return best ?? []
  }

  let bestTeams = buildTeams(playerIds, partnerCounts, recent)
  let bestCost = totalPartnerCost(bestTeams, partnerCounts, recent)
  for (let shift = 1; shift < playerIds.length; shift++) {
    const rotated = [...playerIds.slice(shift), ...playerIds.slice(0, shift)]
    const teams = buildTeams(rotated, partnerCounts, recent)
    const cost = totalPartnerCost(teams, partnerCounts, recent)
    if (cost < bestCost) {
      bestCost = cost
      bestTeams = teams
    }
  }
  const reversed = [...playerIds].reverse()
  const revTeams = buildTeams(reversed, partnerCounts, recent)
  if (totalPartnerCost(revTeams, partnerCounts, recent) < bestCost) {
    bestTeams = revTeams
  }
  return bestTeams
}

/**
 * Pair teams into matches.
 */
export function matchTeams(teams: Pair[]): Array<{ teamA: Pair; teamB: Pair }> {
  if (teams.length % 2 !== 0) {
    throw new Error('matchTeams requires an even number of teams')
  }
  const matches: Array<{ teamA: Pair; teamB: Pair }> = []
  for (let i = 0; i < teams.length; i += 2) {
    matches.push({ teamA: teams[i]!, teamB: teams[i + 1]! })
  }
  return matches
}

/**
 * Generate the next Americano round for a session (active players only).
 * Maximizes unique partners via greedy lowest-repeat pairing; distributes sit-outs evenly.
 */
export function generateNextRound(session: Session): Round {
  const players = activePlayers(session)
  const { courts, partnerCounts, sitOutCounts } = session
  if (players.length < 4) {
    throw new Error('Need at least 4 active players')
  }
  if (courts < 1) {
    throw new Error('Need at least 1 court')
  }

  const slots = playingSlots(players.length, courts)
  if (slots < 4) {
    throw new Error('Not enough active players for a court')
  }

  const sittingOut = chooseSitOuts(players, courts, sitOutCounts, session.sitRequests)
  const sittingSet = new Set(sittingOut)
  const active = players.filter((p) => !sittingSet.has(p.id)).map((p) => p.id)

  if (active.length < 4 || active.length % 4 !== 0) {
    throw new Error(`Invalid active player count: ${active.length}`)
  }

  const recent = recentPartnerSets(session)
  const bestTeams = bestPartnerMatching(active, partnerCounts, recent)
  const paired = matchTeams(bestTeams)
  const matches: Match[] = paired.map((m, i) => ({
    id: createId('match'),
    court: i + 1,
    teamA: m.teamA,
    teamB: m.teamB,
    scoreA: null,
    scoreB: null,
  }))

  return {
    number: session.rounds.length + 1,
    matches,
    sittingOut,
  }
}

function totalPartnerCost(
  teams: Pair[],
  partnerCounts: Record<string, number>,
  recent: Set<string>[] = [],
): number {
  return teams.reduce((sum, [a, b]) => sum + pairCost(a, b, partnerCounts, recent), 0)
}

/** Suggested number of rounds */
export function suggestedRoundCount(playerCount: number, courts: number): number {
  const slots = playingSlots(playerCount, courts)
  if (slots === 0) return 0
  const sitouts = sitOutCount(playerCount, courts)
  if (sitouts === 0) {
    return Math.max(5, Math.min(playerCount - 1, 11))
  }
  const cycle = Math.ceil(playerCount / sitouts)
  return Math.max(cycle, 6)
}

export function recordPartnerships(
  partnerCounts: Record<string, number>,
  matches: Match[],
): Record<string, number> {
  const next = { ...partnerCounts }
  for (const m of matches) {
    const kA = pairKey(m.teamA[0], m.teamA[1])
    const kB = pairKey(m.teamB[0], m.teamB[1])
    next[kA] = (next[kA] ?? 0) + 1
    next[kB] = (next[kB] ?? 0) + 1
  }
  return next
}

export function unrecordPartnerships(
  partnerCounts: Record<string, number>,
  matches: Match[],
): Record<string, number> {
  const next = { ...partnerCounts }
  for (const m of matches) {
    const kA = pairKey(m.teamA[0], m.teamA[1])
    const kB = pairKey(m.teamB[0], m.teamB[1])
    next[kA] = Math.max(0, (next[kA] ?? 0) - 1)
    next[kB] = Math.max(0, (next[kB] ?? 0) - 1)
  }
  return next
}

export function bumpSitOuts(
  sitOutCounts: Record<string, number>,
  sittingOut: string[],
): Record<string, number> {
  const next = { ...sitOutCounts }
  for (const id of sittingOut) {
    next[id] = (next[id] ?? 0) + 1
  }
  return next
}

export function unbumpSitOuts(
  sitOutCounts: Record<string, number>,
  sittingOut: string[],
): Record<string, number> {
  const next = { ...sitOutCounts }
  for (const id of sittingOut) {
    next[id] = Math.max(0, (next[id] ?? 0) - 1)
  }
  return next
}

export function playerSitState(
  session: Session,
  playerId: string,
): { sittingNow: boolean; pendingSit: boolean; pendingPlay: boolean; highlight: boolean } {
  const round = session.rounds[session.currentRoundIndex]
  const sittingNow = Boolean(round?.sittingOut.includes(playerId))
  const pendingSit = Boolean(session.sitRequests?.sit.includes(playerId))
  const pendingPlay = Boolean(session.sitRequests?.play.includes(playerId))
  return {
    sittingNow,
    pendingSit,
    pendingPlay,
    highlight: sittingNow || pendingSit,
  }
}

export function currentRoundHasScores(session: Session): boolean {
  const round = session.rounds[session.currentRoundIndex]
  if (!round) return false
  return round.matches.some((m) => m.scoreA !== null || m.scoreB !== null)
}

/** Suggested courts for an active roster size (does not mutate session). */
export function suggestedCourts(activeCount: number, currentCourts: number): number {
  const maxUseful = Math.max(1, Math.floor(activeCount / 4))
  return Math.min(4, Math.max(1, Math.min(currentCourts, maxUseful) || 1))
}

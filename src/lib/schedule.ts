import { createId, pairKey } from './ids'
import type { Match, Player, Round, Session } from './types'

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
 * Choose who sits out this round: prefer players with fewest sit-outs so far.
 * Tie-break by id for stability.
 */
export function chooseSitOuts(
  players: Player[],
  courts: number,
  sitOutCounts: Record<string, number>,
): string[] {
  const needed = sitOutCount(players.length, courts)
  if (needed <= 0) return []

  const sorted = [...players].sort((a, b) => {
    const sa = sitOutCounts[a.id] ?? 0
    const sb = sitOutCounts[b.id] ?? 0
    if (sa !== sb) return sa - sb
    return a.id.localeCompare(b.id)
  })
  return sorted.slice(0, needed).map((p) => p.id)
}

type Pair = [string, string]

function partnerCost(a: string, b: string, partnerCounts: Record<string, number>): number {
  return partnerCounts[pairKey(a, b)] ?? 0
}

/**
 * Build doubles teams from 4k players, minimizing repeat partnerships.
 * Uses a greedy matching: repeatedly pick the unused pair with lowest prior partner count.
 */
export function buildTeams(
  playerIds: string[],
  partnerCounts: Record<string, number>,
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
        const cost = partnerCost(ids[i]!, ids[j]!, partnerCounts)
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

  const sittingOut = chooseSitOuts(players, courts, sitOutCounts)
  const sittingSet = new Set(sittingOut)
  const active = players.filter((p) => !sittingSet.has(p.id)).map((p) => p.id)

  if (active.length < 4 || active.length % 4 !== 0) {
    throw new Error(`Invalid active player count: ${active.length}`)
  }

  let bestTeams = buildTeams(active, partnerCounts)
  let bestCost = totalPartnerCost(bestTeams, partnerCounts)

  for (let shift = 1; shift < active.length; shift++) {
    const rotated = [...active.slice(shift), ...active.slice(0, shift)]
    const teams = buildTeams(rotated, partnerCounts)
    const cost = totalPartnerCost(teams, partnerCounts)
    if (cost < bestCost) {
      bestCost = cost
      bestTeams = teams
    }
  }

  const reversed = [...active].reverse()
  const revTeams = buildTeams(reversed, partnerCounts)
  const revCost = totalPartnerCost(revTeams, partnerCounts)
  if (revCost < bestCost) {
    bestTeams = revTeams
  }

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

function totalPartnerCost(teams: Pair[], partnerCounts: Record<string, number>): number {
  return teams.reduce((sum, [a, b]) => sum + partnerCost(a, b, partnerCounts), 0)
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

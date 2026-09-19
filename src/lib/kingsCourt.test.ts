import { describe, expect, it } from 'vitest'
import {
  courtMovementHint,
  courtTitle,
  describeMatchMovement,
  generateKingsCourtRound,
  matchWinnersLosers,
  nextCourtGroups,
  seedCourtPairing,
  seedPlayersFromStandings,
  splitPartnersIntoOpponents,
  usedKingsCourt,
} from './kingsCourt'
import { applyScore, computeStandings } from './scoring'
import {
  createEmptySession,
  startSession,
  switchToKingsCourt,
} from './session'
import type { Match, Player, Session } from './types'

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
    active: true,
  }))
}

function scoredMatch(
  court: number,
  teamA: [string, string],
  teamB: [string, string],
  scoreA: number,
  scoreB: number,
): Match {
  return {
    id: `m${court}`,
    court,
    teamA,
    teamB,
    scoreA,
    scoreB,
  }
}

function americanoSession(n: number, courts: number): Session {
  const roster = players(n)
  return startSession({
    ...createEmptySession(),
    players: roster,
    courts,
    scores: Object.fromEntries(roster.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(roster.map((p) => [p.id, 0])),
  })
}

describe('splitPartnersIntoOpponents', () => {
  it('makes each arriving pair opponents (sorted, deterministic)', () => {
    const paired = splitPartnersIntoOpponents(['b', 'a'], ['d', 'c'])
    expect(paired.teamA).toEqual(['a', 'c'])
    expect(paired.teamB).toEqual(['b', 'd'])
  })
})

describe('seedCourtPairing', () => {
  it('pairs 1+4 vs 2+3', () => {
    expect(seedCourtPairing(['p0', 'p1', 'p2', 'p3'])).toEqual({
      teamA: ['p0', 'p3'],
      teamB: ['p1', 'p2'],
    })
  })
})

describe('nextCourtGroups / movement', () => {
  it('Court 1 winners stay with Court 2 winners; losers drop; partners will split', () => {
    const matches = [
      scoredMatch(1, ['a', 'b'], ['c', 'd'], 11, 5),
      scoredMatch(2, ['e', 'f'], ['g', 'h'], 11, 7),
    ]
    const groups = nextCourtGroups(matches)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      court: 1,
      groupA: ['a', 'b'],
      groupB: ['e', 'f'],
    })
    expect(groups[1]).toEqual({
      court: 2,
      groupA: ['c', 'd'],
      groupB: ['g', 'h'],
    })
  })

  it('middle court gets losers from above and winners from below', () => {
    const matches = [
      scoredMatch(1, ['a', 'b'], ['c', 'd'], 11, 4),
      scoredMatch(2, ['e', 'f'], ['g', 'h'], 11, 8),
      scoredMatch(3, ['i', 'j'], ['k', 'l'], 11, 6),
    ]
    const groups = nextCourtGroups(matches)
    expect(groups[0]!.groupA).toEqual(['a', 'b'])
    expect(groups[0]!.groupB).toEqual(['e', 'f'])
    expect(groups[1]!.groupA).toEqual(['c', 'd'])
    expect(groups[1]!.groupB).toEqual(['i', 'j'])
    expect(groups[2]!.groupA).toEqual(['g', 'h'])
    expect(groups[2]!.groupB).toEqual(['k', 'l'])
  })

  it('single court: winners and losers stay (then split)', () => {
    const groups = nextCourtGroups([scoredMatch(1, ['a', 'b'], ['c', 'd'], 11, 9)])
    expect(groups).toEqual([
      { court: 1, groupA: ['a', 'b'], groupB: ['c', 'd'] },
    ])
  })

  it('Court N losers stay; Court 1 winners stay', () => {
    const matches = [
      scoredMatch(1, ['w1', 'w2'], ['l1', 'l2'], 11, 3),
      scoredMatch(2, ['m1', 'm2'], ['n1', 'n2'], 11, 8),
    ]
    const { winners: c1w, losers: c1l } = matchWinnersLosers(matches[0]!)
    const { winners: c2w, losers: c2l } = matchWinnersLosers(matches[1]!)
    const groups = nextCourtGroups(matches)
    expect(groups[0]!.groupA).toEqual(c1w)
    expect(groups[0]!.groupB).toEqual(c2w)
    expect(groups[1]!.groupA).toEqual(c1l)
    expect(groups[1]!.groupB).toEqual(c2l)
  })
})

describe('seedPlayersFromStandings', () => {
  it('orders active players by wins first, then points', () => {
    let session = americanoSession(8, 2)
    const m0 = session.rounds[0]!.matches[0]!
    const m1 = session.rounds[0]!.matches[1]!
    session = applyScore(session, 0, m0.id, 11, 3)
    session = applyScore(session, 0, m1.id, 8, 11)

    const seeded = seedPlayersFromStandings(session)
    const standings = computeStandings(session).filter((s) => s.active)
    expect(seeded.map((p) => p.id)).toEqual(standings.map((s) => s.playerId))
    expect(seeded[0]!.id).toBe(standings[0]!.playerId)
    expect(standings[0]!.gamesWon).toBeGreaterThanOrEqual(standings[standings.length - 1]!.gamesWon)
  })
})

describe('generateKingsCourtRound from standings', () => {
  it('puts the top four toward Court 1 with 1+4 vs 2+3 pairing', () => {
    let session = americanoSession(8, 2)
    for (const m of session.rounds[0]!.matches) {
      session = applyScore(session, 0, m.id, 11, 5)
    }
    const top = seedPlayersFromStandings(session).map((p) => p.id)
    session = { ...session, phase: 'kingsCourt', kingsCourtSeed: 'standings' }
    const round = generateKingsCourtRound(session)

    expect(round.kind).toBe('kingsCourt')
    expect(round.matches).toHaveLength(2)
    expect(round.sittingOut).toHaveLength(0)

    const court1 = round.matches.find((m) => m.court === 1)!
    const onKings = [...court1.teamA, ...court1.teamB]
    expect(new Set(onKings)).toEqual(new Set(top.slice(0, 4)))
    expect(court1.teamA).toEqual([top[0], top[3]])
    expect(court1.teamB).toEqual([top[1], top[2]])

    const court2 = round.matches.find((m) => m.court === 2)!
    const onTwo = [...court2.teamA, ...court2.teamB]
    expect(new Set(onTwo)).toEqual(new Set(top.slice(4, 8)))
  })

  it('sits the lowest-seeded extras (10 players / 2 courts)', () => {
    let session = americanoSession(10, 2)
    for (const m of session.rounds[0]!.matches) {
      session = applyScore(session, 0, m.id, 11, 6)
    }
    const top = seedPlayersFromStandings(session).map((p) => p.id)
    session = { ...session, phase: 'kingsCourt', kingsCourtSeed: 'standings' }
    const round = generateKingsCourtRound(session)
    expect(round.matches).toHaveLength(2)
    expect(round.sittingOut).toEqual(top.slice(8))
    expect(round.sittingOut).toHaveLength(2)
  })

  it('random seed still assigns everyone exactly once (deterministic rng)', () => {
    const session = {
      ...americanoSession(8, 2),
      phase: 'kingsCourt' as const,
      kingsCourtSeed: 'random' as const,
    }
    const rng = () => 0
    const round = generateKingsCourtRound(session, { rng })
    const onCourt = round.matches.flatMap((m) => [...m.teamA, ...m.teamB])
    expect(new Set(onCourt).size).toBe(8)
    expect(round.sittingOut).toHaveLength(0)
    const again = generateKingsCourtRound(session, { rng })
    expect(again.matches.map((m) => [...m.teamA, ...m.teamB].join(','))).toEqual(
      round.matches.map((m) => [...m.teamA, ...m.teamB].join(',')),
    )
  })
})

describe('generateKingsCourtRound from movement + partner split', () => {
  it('rebuilds courts so winners become opponents on the higher court', () => {
    let session = americanoSession(8, 2)
    session = switchToKingsCourt(session, 'standings')
    expect(session.phase).toBe('kingsCourt')
    expect(session.rounds[0]!.kind).toBe('kingsCourt')

    const c1 = session.rounds[0]!.matches.find((m) => m.court === 1)!
    const c2 = session.rounds[0]!.matches.find((m) => m.court === 2)!
    session = applyScore(session, 0, c1.id, 11, 5)
    session = applyScore(session, 0, c2.id, 11, 7)

    const { winners: w1, losers: l1 } = matchWinnersLosers(session.rounds[0]!.matches.find((m) => m.court === 1)!)
    const { winners: w2, losers: l2 } = matchWinnersLosers(session.rounds[0]!.matches.find((m) => m.court === 2)!)

    const next = generateKingsCourtRound(session)
    expect(next.kind).toBe('kingsCourt')
    const n1 = next.matches.find((m) => m.court === 1)!
    const n2 = next.matches.find((m) => m.court === 2)!

    const kings = [...n1.teamA, ...n1.teamB]
    expect(new Set(kings)).toEqual(new Set([...w1, ...w2]))
    // Winners from the same team are now opponents
    const w1opponents =
      n1.teamA.includes(w1[0]) && n1.teamB.includes(w1[1]) ||
      n1.teamA.includes(w1[1]) && n1.teamB.includes(w1[0])
    const w2opponents =
      n1.teamA.includes(w2[0]) && n1.teamB.includes(w2[1]) ||
      n1.teamA.includes(w2[1]) && n1.teamB.includes(w2[0])
    expect(w1opponents).toBe(true)
    expect(w2opponents).toBe(true)

    const bottom = [...n2.teamA, ...n2.teamB]
    expect(new Set(bottom)).toEqual(new Set([...l1, ...l2]))
    const l1opponents =
      n2.teamA.includes(l1[0]) && n2.teamB.includes(l1[1]) ||
      n2.teamA.includes(l1[1]) && n2.teamB.includes(l1[0])
    expect(l1opponents).toBe(true)
  })

  it('keeps Court 1 winners on King’s and Court N losers on the bottom (with sit-outs)', () => {
    let session = americanoSession(10, 2)
    session = switchToKingsCourt(session, 'standings')
    const c1 = session.rounds[0]!.matches.find((m) => m.court === 1)!
    const c2 = session.rounds[0]!.matches.find((m) => m.court === 2)!
    session = applyScore(session, 0, c1.id, 11, 4)
    session = applyScore(session, 0, c2.id, 11, 8)
    const kingsWinners = matchWinnersLosers(
      session.rounds[0]!.matches.find((m) => m.court === 1)!,
    ).winners

    const next = generateKingsCourtRound(session)
    expect(next.sittingOut).toHaveLength(2)
    const n1 = next.matches.find((m) => m.court === 1)!
    const onKings = [...n1.teamA, ...n1.teamB]
    expect(onKings).toEqual(expect.arrayContaining([...kingsWinners]))
    expect(next.sittingOut).not.toEqual(expect.arrayContaining([...kingsWinners]))
  })
})

describe('switchToKingsCourt', () => {
  it('replaces an unscored Americano round and marks the phase', () => {
    const session = americanoSession(8, 2)
    expect(session.rounds[0]!.kind).not.toBe('kingsCourt')
    const next = switchToKingsCourt(session, 'standings')
    expect(next.phase).toBe('kingsCourt')
    expect(next.kingsCourtSeed).toBe('standings')
    expect(next.rounds).toHaveLength(1)
    expect(next.rounds[0]!.kind).toBe('kingsCourt')
    expect(usedKingsCourt(next)).toBe(true)
  })

  it('appends a KC round after a completed Americano round', () => {
    let session = americanoSession(8, 2)
    for (const m of session.rounds[0]!.matches) {
      session = applyScore(session, 0, m.id, 11, 6)
    }
    const next = switchToKingsCourt(session, 'random')
    expect(next.rounds).toHaveLength(2)
    expect(next.rounds[0]!.kind).not.toBe('kingsCourt')
    expect(next.rounds[1]!.kind).toBe('kingsCourt')
    expect(next.currentRoundIndex).toBe(1)
    expect(next.kingsCourtSeed).toBe('random')
  })

  it('blocks switch when the current round is partially scored', () => {
    let session = americanoSession(8, 2)
    session = applyScore(session, 0, session.rounds[0]!.matches[0]!.id, 11, 5)
    expect(() => switchToKingsCourt(session)).toThrow(/Finish or undo/i)
  })

  it('continues banking Americano-style points and tracks KC wins separately', () => {
    let session = americanoSession(4, 1)
    const first = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, first.id, 11, 5)
    session = switchToKingsCourt(session, 'standings')
    const kc = session.rounds[1]!.matches[0]!
    session = applyScore(session, 1, kc.id, 11, 7)

    expect(session.scores[kc.teamA[0]]).toBeGreaterThan(0)
    const standings = computeStandings(session)
    const kcWinner = standings.find((s) => s.playerId === kc.teamA[0])!
    const kcLoser = standings.find((s) => s.playerId === kc.teamB[0])!
    expect(kcWinner.kingsCourtWins).toBe(1)
    expect(kcLoser.kingsCourtWins).toBe(0)
    expect(kcWinner.points).toBe((session.scores[kc.teamA[0]] ?? 0))
    expect(kcWinner.gamesWon).toBeGreaterThanOrEqual(1)
  })
})

describe('labels', () => {
  it('names Court 1 as King’s and describes movement', () => {
    expect(courtTitle(1)).toBe('Court 1 · King’s')
    expect(courtTitle(2)).toBe('Court 2')
    expect(courtMovementHint(1, 2)).toMatch(/Winners stay/)
    expect(courtMovementHint(2, 2)).toMatch(/Losers stay/)
    const note = describeMatchMovement(
      scoredMatch(1, ['p0', 'p1'], ['p2', 'p3'], 11, 5),
      2,
      players(4),
    )
    expect(note).toMatch(/stay on King’s/)
    expect(note).toMatch(/Court 2/)
  })
})

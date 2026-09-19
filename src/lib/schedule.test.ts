import { describe, expect, it } from 'vitest'
import { createId, pairKey } from './ids'
import {
  bestPartnerMatching,
  buildTeams,
  chooseSitOuts,
  generateNextRound,
  partnerKeysFromMatches,
  playingSlots,
  recordPartnerships,
  sitOutCount,
  sitOutHint,
  suggestedRoundCount,
} from './schedule'
import { createEmptySession, startSession } from './session'
import type { Player, Session } from './types'

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
  }))
}

function baseSession(n: number, courts: number): Session {
  const players = makePlayers(n)
  return {
    ...createEmptySession(),
    players,
    courts,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
  }
}

describe('playingSlots / sitOutCount', () => {
  it('uses full courts when roster divisible by 4', () => {
    expect(playingSlots(8, 2)).toBe(8)
    expect(sitOutCount(8, 2)).toBe(0)
  })

  it('distributes sit-outs when N not divisible by 4', () => {
    expect(playingSlots(10, 2)).toBe(8)
    expect(sitOutCount(10, 2)).toBe(2)
    expect(playingSlots(9, 2)).toBe(8)
    expect(sitOutCount(9, 2)).toBe(1)
  })

  it('limits by court count', () => {
    expect(playingSlots(16, 2)).toBe(8)
    expect(sitOutCount(16, 2)).toBe(8)
    expect(playingSlots(16, 4)).toBe(16)
  })
})

describe('chooseSitOuts', () => {
  it('picks players with fewest sit-outs', () => {
    const players = makePlayers(10)
    const counts: Record<string, number> = {
      p0: 2,
      p1: 0,
      p2: 1,
      p3: 0,
      p4: 3,
      p5: 1,
      p6: 2,
      p7: 1,
      p8: 0,
      p9: 1,
    }
    const sit = chooseSitOuts(players, 2, counts)
    expect(sit).toHaveLength(2)
    // p1, p3, p8 have 0 — first two by id order: p1, p3
    expect(sit).toEqual(['p1', 'p3'])
  })

  it('returns empty when no sit-outs needed', () => {
    expect(chooseSitOuts(makePlayers(8), 2, {})).toEqual([])
  })

  it('honors manager sit/play swap', () => {
    const players = makePlayers(10)
    const counts = Object.fromEntries(players.map((p) => [p.id, 0]))
    const swapped = chooseSitOuts(players, 2, counts, { sit: ['p9'], play: ['p1'] })
    expect(swapped).toHaveLength(2)
    expect(swapped).toContain('p9')
    expect(swapped).not.toContain('p1')
  })
})

describe('buildTeams', () => {
  it('pairs everyone exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const teams = buildTeams(ids, {})
    expect(teams).toHaveLength(4)
    const used = teams.flat()
    expect(new Set(used).size).toBe(8)
  })

  it('avoids repeating prior partnerships when possible', () => {
    const ids = ['a', 'b', 'c', 'd']
    const partnerCounts = { [pairKey('a', 'b')]: 5, [pairKey('c', 'd')]: 5 }
    const teams = buildTeams(ids, partnerCounts)
    const keys = teams.map(([x, y]) => pairKey(x, y))
    expect(keys).not.toContain(pairKey('a', 'b'))
    expect(keys).not.toContain(pairKey('c', 'd'))
  })
})

describe('generateNextRound', () => {
  it('creates 2 matches for 8 players / 2 courts', () => {
    const session = baseSession(8, 2)
    const round = generateNextRound(session)
    expect(round.matches).toHaveLength(2)
    expect(round.sittingOut).toHaveLength(0)
    expect(round.number).toBe(1)
    const onCourt = round.matches.flatMap((m) => [...m.teamA, ...m.teamB])
    expect(new Set(onCourt).size).toBe(8)
  })

  it('creates sit-outs for 10 players / 2 courts', () => {
    const session = baseSession(10, 2)
    const round = generateNextRound(session)
    expect(round.matches).toHaveLength(2)
    expect(round.sittingOut).toHaveLength(2)
  })

  it('distributes sit-outs evenly across many rounds', () => {
    let session = baseSession(10, 2)
    const totals: Record<string, number> = Object.fromEntries(
      session.players.map((p) => [p.id, 0]),
    )

    for (let i = 0; i < 10; i++) {
      const round = generateNextRound(session)
      for (const id of round.sittingOut) totals[id] = (totals[id] ?? 0) + 1
      session = {
        ...session,
        rounds: [...session.rounds, round],
        partnerCounts: recordPartnerships(session.partnerCounts, round.matches),
        sitOutCounts: Object.fromEntries(
          Object.entries(totals).map(([k, v]) => [k, v]),
        ),
      }
    }

    const values = Object.values(totals)
    const min = Math.min(...values)
    const max = Math.max(...values)
    expect(max - min).toBeLessThanOrEqual(1)
  })

  it('maximizes unique partners over several rounds (8 players)', () => {
    let session = startSession(baseSession(8, 2))
    const partnerSeen = new Set<string>()

    for (let r = 0; r < 7; r++) {
      const round = session.rounds[session.currentRoundIndex]!
      for (const m of round.matches) {
        partnerSeen.add(pairKey(m.teamA[0], m.teamA[1]))
        partnerSeen.add(pairKey(m.teamB[0], m.teamB[1]))
      }
      if (r < 6) {
        const next = generateNextRound(session)
        session = {
          ...session,
          rounds: [...session.rounds, next],
          currentRoundIndex: session.rounds.length,
          partnerCounts: recordPartnerships(session.partnerCounts, next.matches),
          sitOutCounts: session.sitOutCounts,
        }
      }
    }

    // 8 players: each has 7 possible partners; over 7 rounds each plays 7 games
    // with 1 partner each → 8*7/2 = 28 partner-slots; unique should be high
    expect(partnerSeen.size).toBeGreaterThanOrEqual(14)
  })

  it('does not rematch last-round partners when another pairing exists', () => {
    let session = startSession(baseSession(8, 2))
    const firstKeys = partnerKeysFromMatches(session.rounds[0]!.matches)
    expect(firstKeys.size).toBe(4)

    // Simulate forgotten lifetime counts — still must not rematch last partners.
    session = { ...session, partnerCounts: {} }
    const next = generateNextRound(session)
    const nextKeys = partnerKeysFromMatches(next.matches)
    for (const key of firstKeys) {
      expect(nextKeys.has(key)).toBe(false)
    }
  })

  it('avoids consecutive partner repeats across many Americano rounds', () => {
    let session = startSession(baseSession(8, 2))
    for (let i = 0; i < 12; i++) {
      const prev = partnerKeysFromMatches(session.rounds[session.rounds.length - 1]!.matches)
      const next = generateNextRound(session)
      const nextKeys = partnerKeysFromMatches(next.matches)
      for (const key of prev) {
        expect(nextKeys.has(key)).toBe(false)
      }
      session = {
        ...session,
        rounds: [...session.rounds, next],
        currentRoundIndex: session.rounds.length,
        partnerCounts: recordPartnerships(session.partnerCounts, next.matches),
      }
    }
  })
})

describe('bestPartnerMatching', () => {
  it('refuses an obvious last-round rematch when a new pairing exists', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const last = new Set([pairKey('a', 'b'), pairKey('c', 'd'), pairKey('e', 'f'), pairKey('g', 'h')])
    const teams = bestPartnerMatching(ids, {}, [last])
    const keys = teams.map(([x, y]) => pairKey(x, y))
    for (const key of last) {
      expect(keys).not.toContain(key)
    }
  })
})

describe('suggestedRoundCount', () => {
  it('returns a sensible default', () => {
    expect(suggestedRoundCount(8, 2)).toBeGreaterThanOrEqual(5)
    expect(createId('x')).toMatch(/^x_/)
  })
})

describe('sitOutHint', () => {
  it('explains sit-outs when N is not a multiple of 4 for courts', () => {
    expect(sitOutHint(9, 2)).toBe(
      'With 9 players / 2 courts, 1 sits each round — rotated fairly.',
    )
    expect(sitOutHint(10, 2)).toBe(
      'With 10 players / 2 courts, 2 sit each round — rotated fairly.',
    )
  })

  it('returns null when everyone can play', () => {
    expect(sitOutHint(8, 2)).toBeNull()
    expect(sitOutHint(3, 1)).toBeNull()
  })
})

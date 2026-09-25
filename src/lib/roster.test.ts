import { describe, expect, it } from 'vitest'
import { activePlayers, currentRoundHasScores } from './schedule'
import { applyScore, computeStandings } from './scoring'
import {
  addPlayer,
  advanceToNextRound,
  createEmptySession,
  leavePlayer,
  regenerateCurrentRound,
  startSession,
  switchToKingsCourt,
  toggleSit,
} from './session'
import type { Player, Session } from './types'

function makeActiveSession(n = 8, courts = 2): Session {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
    active: true,
  }))
  return startSession({
    ...createEmptySession(),
    players,
    courts,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
  })
}

describe('addPlayer during active session', () => {
  it('adds with 0 differential and regenerates unscored round', () => {
    const session = makeActiveSession(8, 2)
    const beforeIds = new Set(
      session.rounds[0]!.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
    )
    expect(currentRoundHasScores(session)).toBe(false)

    const result = addPlayer(session, 'Latecomer')
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(true)
    expect(result.session.players).toHaveLength(9)
    const late = result.session.players.find((p) => p.name === 'Latecomer')!
    expect(result.session.scores[late.id]).toBe(0)
    expect(late.active).not.toBe(false)

    // Round rebuilt for 9 players → 1 sit-out
    expect(result.session.rounds[0]!.sittingOut).toHaveLength(1)
    expect(result.session.rounds[0]!.matches).toHaveLength(2)
    // Match ids changed (regenerated)
    const afterMatchIds = result.session.rounds[0]!.matches.map((m) => m.id)
    const beforeMatchIds = session.rounds[0]!.matches.map((m) => m.id)
    expect(afterMatchIds).not.toEqual(beforeMatchIds)
    void beforeIds
  })

  it('does not regenerate when current round already has scores', () => {
    let session = makeActiveSession(8, 2)
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 7)

    const result = addPlayer(session, 'Spectator')
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(false)
    expect(result.reason).toMatch(/next round/i)
    expect(result.session.rounds[0]!.matches[0]!.id).toBe(match.id)
    expect(result.session.rounds[0]!.matches[0]!.scoreA).toBe(11)

    const standings = computeStandings(result.session)
    const row = standings.find((s) => s.name === 'Spectator')
    expect(row?.points).toBe(0)
    expect(row?.gamesPlayed).toBe(0)
  })
})

describe('leavePlayer during active session', () => {
  it('marks inactive, keeps differential, regenerates unscored round', () => {
    let session = makeActiveSession(8, 2)
    // Score a previous conceptual state: put points on p0 then clear via... 
    // Instead leave from unscored round after manually giving points
    session = {
      ...session,
      scores: { ...session.scores, p0: 22 },
    }

    const result = leavePlayer(session, 'p0')
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(true)

    const left = result.session.players.find((p) => p.id === 'p0')!
    expect(left.active).toBe(false)
    expect(result.session.scores.p0).toBe(22)
    expect(activePlayers(result.session)).toHaveLength(7)

    // Left player not in new pairings
    const onCourt = result.session.rounds[0]!.matches.flatMap((m) => [
      ...m.teamA,
      ...m.teamB,
    ])
    const sitting = result.session.rounds[0]!.sittingOut
    expect(onCourt).not.toContain('p0')
    expect(sitting).not.toContain('p0')

    const standings = computeStandings(result.session)
    const row = standings.find((s) => s.playerId === 'p0')!
    expect(row.active).toBe(false)
    expect(row.points).toBe(22)
  })

  it('defers leave until the next round when the current round has scores', () => {
    let session = makeActiveSession(8, 2)
    const match = session.rounds[0]!.matches[0]!
    const playerId = match.teamA[0]!
    session = applyScore(session, 0, match.id, 11, 5)
    const before = computeStandings(session).find((s) => s.playerId === playerId)!

    const result = leavePlayer(session, playerId)
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(false)
    expect(result.reason).toMatch(/next round/i)
    expect(result.session.players.find((p) => p.id === playerId)!.active).toBe(false)
    expect(result.session.rounds[0]!.matches[0]!.teamA).toContain(playerId)
    expect(result.session.rounds[0]!.matches[0]!.scoreA).toBe(11)

    const row = computeStandings(result.session).find((s) => s.playerId === playerId)!
    expect(row.active).toBe(false)
    expect(row.points).toBe(before.points)
    expect(row.gamesWon).toBe(before.gamesWon)

    let next = result.session
    for (const m of next.rounds[0]!.matches) {
      if (m.scoreA === null) next = applyScore(next, 0, m.id, 11, 7)
    }
    next = advanceToNextRound(next)
    const scheduled = [
      ...next.rounds[1]!.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...next.rounds[1]!.sittingOut,
    ]
    expect(scheduled).not.toContain(playerId)
  })

  it('sits someone without removing them, and leave takes them off the schedule', () => {
    const session = makeActiveSession(8, 2)
    const sat = toggleSit(session, 'p0')
    expect(sat.ok).toBe(true)
    expect(sat.session.players.find((p) => p.id === 'p0')!.active).not.toBe(false)
    expect(sat.session.rounds[0]!.sittingOut).toContain('p0')
    expect(computeStandings(sat.session).find((s) => s.playerId === 'p0')!.active).toBe(true)

    const left = leavePlayer(session, 'p1')
    expect(left.ok).toBe(true)
    expect(left.session.players.find((p) => p.id === 'p1')!.active).toBe(false)
    const scheduled = [
      ...left.session.rounds[0]!.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...left.session.rounds[0]!.sittingOut,
    ]
    expect(scheduled).not.toContain('p1')
    const row = computeStandings(left.session).find((s) => s.playerId === 'p1')!
    expect(row.active).toBe(false)
    expect(row.points).toBe(session.scores.p1 ?? 0)
  })

  it('leaves a player out of an unscored King’s Court round and the next ladder', () => {
    let session = switchToKingsCourt(makeActiveSession(8, 2), 'standings')
    expect(session.phase).toBe('kingsCourt')
    const leaver = session.rounds[0]!.matches[0]!.teamA[0]!
    const left = leavePlayer(session, leaver)
    expect(left.ok).toBe(true)
    expect(left.regenerated).toBe(true)
    const still = [
      ...left.session.rounds[0]!.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...left.session.rounds[0]!.sittingOut,
    ]
    expect(still).not.toContain(leaver)
    expect(left.session.rounds[0]!.kind).toBe('kingsCourt')
    for (const m of left.session.rounds[0]!.matches) {
      expect(m.teamA).toHaveLength(2)
      expect(m.teamB).toHaveLength(2)
    }
    expect(computeStandings(left.session).find((s) => s.playerId === leaver)!.active).toBe(false)

    session = switchToKingsCourt(makeActiveSession(8, 2), 'standings')
    const courtPlayer = session.rounds[0]!.matches[0]!.teamA[0]!
    session = {
      ...session,
      scores: { ...session.scores, [courtPlayer]: 14 },
    }
    session = applyScore(session, 0, session.rounds[0]!.matches[0]!.id, 11, 5)
    const deferred = leavePlayer(session, courtPlayer)
    expect(deferred.ok).toBe(true)
    expect(deferred.regenerated).toBe(false)
    expect(deferred.session.scores[courtPlayer]).toBeGreaterThan(0)

    let next = deferred.session
    for (const m of next.rounds[0]!.matches) {
      if (m.scoreA === null) next = applyScore(next, 0, m.id, 11, 6)
    }
    next = advanceToNextRound(next)
    const later = next.rounds.at(-1)!
    const scheduled = [
      ...later.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...later.sittingOut,
    ]
    expect(scheduled).not.toContain(courtPlayer)
    expect(later.kind).toBe('kingsCourt')
    expect(later.matches.length).toBeGreaterThan(0)
    for (const m of later.matches) {
      expect([...m.teamA, ...m.teamB]).toHaveLength(4)
    }
  })

  it('blocks leave below 4 active players during King’s Court', () => {
    const session = switchToKingsCourt(makeActiveSession(4, 1), 'standings')
    const result = leavePlayer(session, 'p0')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/4 active/i)
    expect(result.session.players.find((p) => p.id === 'p0')!.active).not.toBe(false)
  })

  it('blocks leave when only 4 active remain', () => {
    const session = makeActiveSession(4, 1)
    const result = leavePlayer(session, 'p0')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/4 active/i)
  })
})

describe('regenerateCurrentRound', () => {
  it('throws if scores exist', () => {
    let session = makeActiveSession(8, 2)
    session = applyScore(session, 0, session.rounds[0]!.matches[0]!.id, 11, 6)
    expect(() => regenerateCurrentRound(session)).toThrow(/scores/i)
  })

  it('sit-out fairness uses only active players going forward', () => {
    let session = makeActiveSession(10, 2)
    expect(session.rounds[0]!.sittingOut).toHaveLength(2)

    const result = leavePlayer(session, session.rounds[0]!.sittingOut[0]!)
    expect(result.ok).toBe(true)
    // 9 active / 2 courts → 1 sit-out
    expect(result.session.rounds[0]!.sittingOut).toHaveLength(1)
    expect(activePlayers(result.session)).toHaveLength(9)
  })
})

describe('normalize / continue preserves inactive', () => {
  it('keeps active:false through normalizeSession path used by history', async () => {
    const { normalizeSession } = await import('./session')
    const session = makeActiveSession(8, 2)
    const left = leavePlayer(session, 'p2')
    expect(left.ok).toBe(true)
    const normalized = normalizeSession(JSON.parse(JSON.stringify(left.session)))
    expect(normalized.players.find((p) => p.id === 'p2')!.active).toBe(false)
  })
})

describe('toggleSit', () => {
  it('sits a player and rebuilds an unscored round', () => {
    const session = makeActiveSession(8, 2)
    expect(session.rounds[0]!.sittingOut).toHaveLength(0)

    const result = toggleSit(session, 'p0')
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(true)
    expect(result.session.rounds[0]!.sittingOut).toContain('p0')
    const onCourt = result.session.rounds[0]!.matches.flatMap((m) => [
      ...m.teamA,
      ...m.teamB,
    ])
    expect(onCourt).not.toContain('p0')
    expect(result.session.players.find((p) => p.id === 'p0')!.active).not.toBe(false)
  })

  it('highlights system byes so the manager can unsit and swap', () => {
    const session = makeActiveSession(10, 2)
    const systemSit = session.rounds[0]!.sittingOut[0]!
    expect(systemSit).toBeTruthy()

    const unsit = toggleSit(session, systemSit)
    expect(unsit.ok).toBe(true)
    expect(unsit.regenerated).toBe(true)
    expect(unsit.session.rounds[0]!.sittingOut).not.toContain(systemSit)
    expect(unsit.session.rounds[0]!.sittingOut).toHaveLength(2)

    const onCourt = unsit.session.rounds[0]!.matches.flatMap((m) => [
      ...m.teamA,
      ...m.teamB,
    ])
    expect(onCourt).toContain(systemSit)
  })

  it('defers sit changes to the next round when scores exist', () => {
    let session = makeActiveSession(8, 2)
    session = applyScore(session, 0, session.rounds[0]!.matches[0]!.id, 11, 5)

    const result = toggleSit(session, 'p3')
    expect(result.ok).toBe(true)
    expect(result.regenerated).toBe(false)
    expect(result.reason).toMatch(/next round/i)
    expect(result.session.rounds[0]!.matches[0]!.scoreA).toBe(11)
    expect(result.session.sitRequests?.sit).toContain('p3')
  })
})

describe('renamePlayer', () => {
  it('updates name and preserves id and differential', async () => {
    const { renamePlayer } = await import('./session')
    let session = makeActiveSession(8, 2)
    session = {
      ...session,
      scores: { ...session.scores, p0: 33 },
    }
    const beforeId = 'p0'
    const result = renamePlayer(session, beforeId, '  Barry Fixed  ')
    expect(result.ok).toBe(true)
    const renamed = result.session.players.find((p) => p.id === beforeId)!
    expect(renamed.name).toBe('Barry Fixed')
    expect(renamed.id).toBe(beforeId)
    expect(result.session.scores[beforeId]).toBe(33)
  })

  it('rejects empty names', async () => {
    const { renamePlayer } = await import('./session')
    const session = makeActiveSession(4, 1)
    const result = renamePlayer(session, 'p0', '   ')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/empty/i)
    expect(result.session.players.find((p) => p.id === 'p0')!.name).toBe('P1')
  })

  it('rejects a rename that collides with another player (case-insensitive)', async () => {
    const { renamePlayer } = await import('./session')
    const session = makeActiveSession(4, 1)
    const clash = renamePlayer(session, 'p0', '  p2  ')
    expect(clash.ok).toBe(false)
    expect(clash.reason).toBe('That name is already in the list.')
    expect(clash.session.players.find((p) => p.id === 'p0')!.name).toBe('P1')
  })

  it('allows a player to keep their own name with different spacing/case only if unique', async () => {
    const { renamePlayer } = await import('./session')
    const session = makeActiveSession(4, 1)
    const same = renamePlayer(session, 'p0', 'P1')
    expect(same.ok).toBe(true)
    expect(same.session.players.find((p) => p.id === 'p0')!.name).toBe('P1')
  })
})

describe('duplicate names', () => {
  it('rejects adding a name already on the roster (case-insensitive)', () => {
    const session = makeActiveSession(4, 1)
    const result = addPlayer(session, '  p1  ')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('That name is already in the list.')
    expect(result.session.players).toHaveLength(4)
  })

  it('rejects adding the same name with different case during setup', () => {
    let session = createEmptySession()
    session = addPlayer(session, 'Ava').session
    const dup = addPlayer(session, 'AVA')
    expect(dup.ok).toBe(false)
    expect(dup.reason).toBe('That name is already in the list.')
    expect(dup.session.players).toHaveLength(1)
  })

  it('re-adds someone who left under the same name, keeping id and differential', () => {
    let session = makeActiveSession(8, 2)
    session = {
      ...session,
      scores: { ...session.scores, p0: 18 },
    }
    const left = leavePlayer(session, 'p0')
    expect(left.ok).toBe(true)
    expect(left.session.players.find((p) => p.id === 'p0')!.active).toBe(false)

    const back = addPlayer(left.session, '  p1  ')
    expect(back.ok).toBe(true)
    expect(back.reason).toMatch(/back/i)
    const player = back.session.players.find((p) => p.id === 'p0')!
    expect(player.active).not.toBe(false)
    expect(player.name).toBe('P1')
    expect(back.session.scores.p0).toBe(18)
    expect(back.session.players).toHaveLength(8)
    const scheduled = [
      ...back.session.rounds[0]!.matches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...back.session.rounds[0]!.sittingOut,
    ]
    expect(scheduled).toContain('p0')
  })
})

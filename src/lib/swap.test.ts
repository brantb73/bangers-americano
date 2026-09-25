import { describe, expect, it } from 'vitest'
import { pairKey } from './ids'
import { applyScore } from './scoring'
import {
  advanceToNextRound,
  createEmptySession,
  startSession,
  swapPlayers,
  switchToKingsCourt,
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

describe('swapPlayers', () => {
  it('swaps a court player with a sitter and updates sit counts and partners', () => {
    const session = makeActiveSession(5, 1)
    const round = session.rounds[0]!
    expect(round.sittingOut).toHaveLength(1)
    const sitter = round.sittingOut[0]!
    const match = round.matches[0]!
    const courtPlayer = match.teamA[0]!
    const partner = match.teamA[1]!
    expect(session.sitOutCounts[sitter]).toBe(1)
    expect(session.sitOutCounts[courtPlayer] ?? 0).toBe(0)

    const result = swapPlayers(session, courtPlayer, sitter)
    expect(result.ok).toBe(true)
    const next = result.session.rounds[0]!
    expect(next.sittingOut).toEqual([courtPlayer])
    expect(next.matches[0]!.teamA).toContain(sitter)
    expect(next.matches[0]!.teamA).not.toContain(courtPlayer)
    expect(next.matches[0]!.id).toBe(match.id)
    expect(result.session.sitOutCounts[sitter] ?? 0).toBe(0)
    expect(result.session.sitOutCounts[courtPlayer]).toBe(1)
    expect(result.session.partnerCounts[pairKey(courtPlayer, partner)] ?? 0).toBe(0)
    expect(result.session.partnerCounts[pairKey(sitter, partner)]).toBe(1)
  })

  it('swaps players across courts and updates both partnerships', () => {
    const session = makeActiveSession(8, 2)
    const m0 = session.rounds[0]!.matches[0]!
    const m1 = session.rounds[0]!.matches[1]!
    const a = m0.teamA[0]!
    const b = m1.teamA[0]!
    const aPartner = m0.teamA[1]!
    const bPartner = m1.teamA[1]!

    const result = swapPlayers(session, a, b)
    expect(result.ok).toBe(true)
    const [n0, n1] = result.session.rounds[0]!.matches
    expect(n0!.teamA[0]).toBe(b)
    expect(n1!.teamA[0]).toBe(a)
    expect(n0!.teamA[1]).toBe(aPartner)
    expect(n1!.teamA[1]).toBe(bPartner)
    expect(result.session.partnerCounts[pairKey(a, aPartner)] ?? 0).toBe(0)
    expect(result.session.partnerCounts[pairKey(b, bPartner)] ?? 0).toBe(0)
    expect(result.session.partnerCounts[pairKey(b, aPartner)]).toBe(1)
    expect(result.session.partnerCounts[pairKey(a, bPartner)]).toBe(1)
    expect(result.session.rounds[0]!.sittingOut).toEqual(session.rounds[0]!.sittingOut)
  })

  it('swaps partners within a match', () => {
    const session = makeActiveSession(8, 2)
    const match = session.rounds[0]!.matches[0]!
    const a = match.teamA[0]!
    const b = match.teamB[0]!
    const aMate = match.teamA[1]!
    const bMate = match.teamB[1]!

    const result = swapPlayers(session, a, b)
    expect(result.ok).toBe(true)
    const next = result.session.rounds[0]!.matches[0]!
    expect(next.teamA).toEqual([b, aMate])
    expect(next.teamB).toEqual([a, bMate])
    expect(result.session.partnerCounts[pairKey(a, aMate)] ?? 0).toBe(0)
    expect(result.session.partnerCounts[pairKey(b, bMate)] ?? 0).toBe(0)
    expect(result.session.partnerCounts[pairKey(b, aMate)]).toBe(1)
    expect(result.session.partnerCounts[pairKey(a, bMate)]).toBe(1)
    expect(result.session.rounds[0]!.matches[1]).toEqual(session.rounds[0]!.matches[1])
    expect(result.session.sitOutCounts).toEqual(session.sitOutCounts)
  })

  it('blocks a swap that touches a scored match', () => {
    let session = makeActiveSession(8, 2)
    const scored = session.rounds[0]!.matches[0]!
    const open = session.rounds[0]!.matches[1]!
    session = applyScore(session, 0, scored.id, 11, 5)

    const within = swapPlayers(session, scored.teamA[0]!, scored.teamB[0]!)
    expect(within.ok).toBe(false)
    expect(within.reason).toMatch(/already has a score/i)
    expect(within.session.rounds[0]!.matches[0]!.teamA).toEqual(scored.teamA)
    expect(within.session.rounds[0]!.matches[0]!.scoreA).toBe(11)

    const across = swapPlayers(session, scored.teamA[0]!, open.teamA[0]!)
    expect(across.ok).toBe(false)
    expect(across.reason).toMatch(/Court \d+ already has a score/)
    expect(across.session.rounds[0]!.matches[1]!.teamA).toEqual(open.teamA)
    expect(across.session.partnerCounts).toEqual(session.partnerCounts)
  })

  it('uses the swapped King’s Court lineup when the ladder moves', () => {
    let session = switchToKingsCourt(makeActiveSession(8, 2), 'standings')
    const match = session.rounds[0]!.matches[0]!
    const movedOffWinners = match.teamA[1]!
    const movedOntoWinners = match.teamB[0]!
    const swapped = swapPlayers(session, movedOffWinners, movedOntoWinners)
    expect(swapped.ok).toBe(true)
    session = swapped.session
    session = applyScore(session, 0, session.rounds[0]!.matches[0]!.id, 11, 5)
    session = applyScore(session, 0, session.rounds[0]!.matches[1]!.id, 11, 4)
    session = advanceToNextRound(session)

    const court1 = session.rounds[1]!.matches.find((m) => m.court === 1)!
    const court2 = session.rounds[1]!.matches.find((m) => m.court === 2)!
    const onCourt1 = [...court1.teamA, ...court1.teamB]
    const onCourt2 = [...court2.teamA, ...court2.teamB]
    expect(onCourt1).toContain(movedOntoWinners)
    expect(onCourt1).not.toContain(movedOffWinners)
    expect(onCourt2).toContain(movedOffWinners)
  })
})

import { describe, expect, it } from 'vitest'
import { generateSportsCenterRecap } from './recap'
import { applyScore, computeStandings } from './scoring'
import {
  createEmptySession,
  setMatchComment,
  setRoundNote,
  startSession,
} from './session'
import type { Player, Session } from './types'

function makeSession(n = 4): Session {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Star${i + 1}`,
    active: true,
  }))
  return startSession({
    ...createEmptySession(),
    players,
    courts: 1,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
  })
}

describe('match comments persistence', () => {
  it('stores comment on the match via setMatchComment', () => {
    let session = makeSession()
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 7)
    session = setMatchComment(session, 0, match.id, 'Absolute clinic on the kitchen line!')

    const saved = session.rounds[0]!.matches[0]!
    expect(saved.comment).toBe('Absolute clinic on the kitchen line!')

    session = setRoundNote(session, 0, 'Crowd going wild')
    expect(session.rounds[0]!.note).toBe('Crowd going wild')

    const revived = JSON.parse(JSON.stringify(session)) as Session
    expect(revived.rounds[0]!.matches[0]!.comment).toContain('kitchen')
    expect(revived.rounds[0]!.note).toBe('Crowd going wild')
  })
})

describe('generateSportsCenterRecap', () => {
  it('names the champion and weaves in a user comment with snarky podcast tone', () => {
    let session = makeSession()
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 5)
    session = setMatchComment(session, 0, match.id, 'Dink battle of the century')

    const standings = computeStandings(session)
    const champ = standings[0]!.name
    const script = generateSportsCenterRecap(session)

    expect(script).toMatch(/Bangers Highlight Reel|Highlight Reel/i)
    expect(script).toContain(champ)
    expect(script).toContain('Dink battle of the century')
    expect(script).toMatch(/stay classy/i)
    // Snark markers
    expect(script.toLowerCase()).toMatch(/podcast|highlight reel|participated|bench|smugly|hot take/)
  })

  it('mentions a King’s Court finish when the hybrid phase was used', async () => {
    const { switchToKingsCourt } = await import('./session')
    let session = makeSession()
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 5)
    session = switchToKingsCourt(session, 'standings')
    const kc = session.rounds[1]!.matches[0]!
    session = applyScore(session, 1, kc.id, 11, 7)

    const script = generateSportsCenterRecap(session)
    expect(script).toMatch(/King’s Court/i)
    expect(script).toMatch(/hybrid|throne|ladder/i)
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyScore,
  computeStandings,
  isRoundComplete,
  isValidFinishedScore,
  isValidSuddenDeathScore,
  scoringRuleSummary,
  undoLastScore,
  validateScoreInput,
  validateSuddenDeathScore,
} from './scoring'
import { advanceToNextRound, createEmptySession, startSession } from './session'
import type { Player, Session } from './types'

function makeSession(n = 8, courts = 2, winBy: 1 | 2 = 2): Session {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
  }))
  return startSession({
    ...createEmptySession(),
    players,
    courts,
    winBy,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
  })
}

describe('applyScore / Americano banking', () => {
  it('adds team points to each player on that team', () => {
    let session = makeSession()
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 7)

    expect(session.scores[match.teamA[0]]).toBe(11)
    expect(session.scores[match.teamA[1]]).toBe(11)
    expect(session.scores[match.teamB[0]]).toBe(7)
    expect(session.scores[match.teamB[1]]).toBe(7)
  })

  it('rejects re-scoring without undo', () => {
    let session = makeSession()
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 11, 5)
    expect(() => applyScore(session, 0, match.id, 10, 8)).toThrow()
  })
})

describe('undoLastScore', () => {
  it('restores points and clears match scores', () => {
    let session = makeSession()
    const m0 = session.rounds[0]!.matches[0]!
    const m1 = session.rounds[0]!.matches[1]!
    session = applyScore(session, 0, m0.id, 11, 4)
    session = applyScore(session, 0, m1.id, 9, 11)
    session = undoLastScore(session)

    expect(session.rounds[0]!.matches[1]!.scoreA).toBeNull()
    expect(session.rounds[0]!.matches[1]!.scoreB).toBeNull()
    expect(session.scores[m1.teamA[0]]).toBe(0)
    expect(session.scores[m0.teamA[0]]).toBe(11)
  })

  it('is a no-op when log is empty', () => {
    const session = makeSession()
    expect(undoLastScore(session)).toEqual(session)
  })
})

describe('validateScoreInput / win by', () => {
  it('summarizes rules plainly', () => {
    expect(scoringRuleSummary(11, 2)).toBe('First to 11, win by 2')
    expect(scoringRuleSummary(15, 1)).toBe('First to 15, win by 1')
  })

  it('win-by-2 rejects 11–10', () => {
    expect(validateScoreInput(11, 10, 11, 2)).toBe('Need win by 2')
    expect(isValidFinishedScore(11, 10, 11, 2)).toBe(false)
  })

  it('win-by-2 accepts 11–9 and overtime 12–10', () => {
    expect(validateScoreInput(11, 9, 11, 2)).toBeNull()
    expect(validateScoreInput(12, 10, 11, 2)).toBeNull()
    expect(isValidFinishedScore(15, 13, 11, 2)).toBe(true)
  })

  it('win-by-2 requires reaching game-to', () => {
    expect(validateScoreInput(10, 8, 11, 2)).toBe('Need 11 to win')
  })

  it('win-by-1 accepts 11–10', () => {
    expect(validateScoreInput(11, 10, 11, 1)).toBeNull()
    expect(isValidFinishedScore(11, 10, 11, 1)).toBe(true)
  })

  it('win-by-1 still requires reaching game-to', () => {
    expect(validateScoreInput(9, 7, 11, 1)).toBe('Need 11 to win')
  })

  it('rejects ties', () => {
    expect(validateScoreInput(11, 11, 11, 2)).toBe('Scores cannot be tied')
  })
})

describe('sudden death validation', () => {
  it('accepts early finishes like 5–6', () => {
    expect(validateSuddenDeathScore(5, 6)).toBeNull()
    expect(validateSuddenDeathScore(6, 5)).toBeNull()
    expect(isValidSuddenDeathScore(5, 6)).toBe(true)
    expect(validateScoreInput(5, 6, 11, 2)).toBe('Need 11 to win')
  })

  it('blocks ties — sudden death needs a winner', () => {
    expect(validateSuddenDeathScore(5, 5)).toBe(
      'Sudden death needs a winner — scores can’t be tied',
    )
    expect(isValidSuddenDeathScore(7, 7)).toBe(false)
  })

  it('still rejects empty / non-integer basics', () => {
    expect(validateSuddenDeathScore(0, 0)).toBe('Enter the final score')
    expect(validateSuddenDeathScore(1.5, 2)).toBe('Enter whole numbers')
  })

  it('banks points and credits a win on early finish via applyScore', () => {
    let session = makeSession(4, 1)
    const match = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, match.id, 5, 6)

    expect(session.scores[match.teamA[0]]).toBe(5)
    expect(session.scores[match.teamB[0]]).toBe(6)

    const standings = computeStandings(session)
    const winners = standings.filter((s) => match.teamB.includes(s.playerId))
    const losers = standings.filter((s) => match.teamA.includes(s.playerId))
    expect(winners.every((s) => s.gamesWon === 1)).toBe(true)
    expect(losers.every((s) => s.gamesWon === 0)).toBe(true)
    // Wins-first: 6-point winners rank above 5-point losers
    expect(standings[0]!.gamesWon).toBe(1)
    expect(standings[0]!.points).toBe(6)
  })
})

describe('standings', () => {
  it('ranks by games won first, then points', () => {
    let session = makeSession()
    const m0 = session.rounds[0]!.matches[0]!
    const m1 = session.rounds[0]!.matches[1]!
    session = applyScore(session, 0, m0.id, 11, 3)
    session = applyScore(session, 0, m1.id, 8, 11)

    const standings = computeStandings(session)
    // Four players with 1 win + 11 pts share the top under wins-first
    const top = standings.filter((s) => s.gamesWon === 1 && s.points === 11)
    expect(top).toHaveLength(4)
    top.forEach((s) => expect(s.rank).toBe(1))
    expect(standings[0]!.gamesWon).toBe(1)
  })

  it('player with more wins ranks above someone with more points but fewer wins', () => {
    let session = makeSession(4, 1)
    const r0 = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, r0.id, 6, 5)

    session = advanceToNextRound(session)
    const r1 = session.rounds[1]!.matches[0]!
    const leaderCandidate = r0.teamA[0]!
    if (r1.teamA.includes(leaderCandidate)) {
      session = applyScore(session, 1, r1.id, 6, 5)
    } else {
      session = applyScore(session, 1, r1.id, 5, 6)
    }

    let standings = computeStandings(session)
    const maxWins = Math.max(...standings.map((s) => s.gamesWon))
    const leader = standings.find((s) => s.gamesWon === maxWins)!
    const fewerWins = standings.find((s) => s.gamesWon < maxWins)
    expect(fewerWins).toBeTruthy()

    // Inflate points on the fewer-wins player — they should still rank below
    session = {
      ...session,
      scores: {
        ...session.scores,
        [fewerWins!.playerId]: leader.points + 50,
      },
    }
    standings = computeStandings(session)
    const leader2 = standings.find((s) => s.playerId === leader.playerId)!
    const inflated = standings.find((s) => s.playerId === fewerWins!.playerId)!
    expect(inflated.points).toBeGreaterThan(leader2.points)
    expect(leader2.gamesWon).toBeGreaterThan(inflated.gamesWon)
    expect(leader2.rank).toBeLessThan(inflated.rank)
  })

  it('includes gamesPlayed on each row', () => {
    let session = makeSession()
    const m0 = session.rounds[0]!.matches[0]!
    session = applyScore(session, 0, m0.id, 11, 7)
    const standings = computeStandings(session)
    const played = standings.filter((s) => s.gamesPlayed === 1)
    expect(played.length).toBe(4)
  })

  it('marks round complete when all matches scored', () => {
    let session = makeSession()
    expect(isRoundComplete(session, 0)).toBe(false)
    for (const m of session.rounds[0]!.matches) {
      session = applyScore(session, 0, m.id, 11, 6)
    }
    expect(isRoundComplete(session, 0)).toBe(true)
  })
})

import type { Match, Player, ScoreEntry, Session, Standing, WinBy } from './types'

export function isMatchComplete(match: Match): boolean {
  return match.scoreA !== null && match.scoreB !== null
}

export function isRoundComplete(session: Session, roundIndex: number): boolean {
  const round = session.rounds[roundIndex]
  if (!round) return false
  return round.matches.every(isMatchComplete)
}

/** Plain-language scoring rule, e.g. "First to 11, win by 2". */
export function scoringRuleSummary(pointsToWin: number, winBy: WinBy): string {
  return `First to ${pointsToWin}, win by ${winBy}`
}

/** Point differential for a finished match: A gets A−B, B gets B−A. */
export function matchPointDifferentials(
  scoreA: number,
  scoreB: number,
): { deltaA: number; deltaB: number } {
  return { deltaA: scoreA - scoreB, deltaB: scoreB - scoreA }
}

/** Per-player differential deltas for a match (same value for both teammates). */
export function playerDeltasForMatch(
  teamA: readonly string[],
  teamB: readonly string[],
  scoreA: number,
  scoreB: number,
): Record<string, number> {
  const { deltaA, deltaB } = matchPointDifferentials(scoreA, scoreB)
  const deltas: Record<string, number> = {}
  for (const id of teamA) deltas[id] = deltaA
  for (const id of teamB) deltas[id] = deltaB
  return deltas
}

/** Display differential with a sign so negatives stay obvious (+6, −6, 0). */
export function formatDifferential(n: number): string {
  if (n > 0) return `+${n}`
  return String(n)
}

/**
 * Rebuild running differentials from stored match scores.
 * Migrates old sessions that banked team totals instead of A−B / B−A.
 */
export function recomputeScoresFromMatches(session: Session): Session {
  const scores: Record<string, number> = {}
  for (const p of session.players) scores[p.id] = 0
  for (const id of Object.keys(session.scores ?? {})) {
    if (!(id in scores)) scores[id] = 0
  }

  for (const round of session.rounds) {
    for (const m of round.matches) {
      if (!isMatchComplete(m) || m.scoreA === null || m.scoreB === null) continue
      const deltas = playerDeltasForMatch(m.teamA, m.teamB, m.scoreA, m.scoreB)
      for (const [id, diff] of Object.entries(deltas)) {
        scores[id] = (scores[id] ?? 0) + diff
      }
    }
  }

  const scoreLog = session.scoreLog.map((entry) => {
    const match = session.rounds[entry.roundIndex]?.matches.find((m) => m.id === entry.matchId)
    if (!match) return entry
    return {
      ...entry,
      deltas: playerDeltasForMatch(match.teamA, match.teamB, entry.scoreA, entry.scoreB),
    }
  })

  return { ...session, scores, scoreLog }
}

/** Apply a completed score: each player gets their team's point differential. */
export function applyScore(
  session: Session,
  roundIndex: number,
  matchId: string,
  scoreA: number,
  scoreB: number,
): Session {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    throw new Error('Scores must be non-negative integers')
  }

  const round = session.rounds[roundIndex]
  if (!round) throw new Error('Round not found')
  const match = round.matches.find((m) => m.id === matchId)
  if (!match) throw new Error('Match not found')
  if (isMatchComplete(match)) {
    throw new Error('Match already scored — undo first')
  }

  const deltas = playerDeltasForMatch(match.teamA, match.teamB, scoreA, scoreB)

  const scores = { ...session.scores }
  for (const [id, diff] of Object.entries(deltas)) {
    scores[id] = (scores[id] ?? 0) + diff
  }

  const matches = round.matches.map((m) =>
    m.id === matchId ? { ...m, scoreA, scoreB } : m,
  )
  const rounds = session.rounds.map((r, i) =>
    i === roundIndex ? { ...r, matches } : r,
  )

  const entry: ScoreEntry = { roundIndex, matchId, scoreA, scoreB, deltas }
  const firstScoreInRound = !round.matches.some(isMatchComplete)

  return {
    ...session,
    scores,
    rounds,
    scoreLog: [...session.scoreLog, entry],
    // Sit requests for the current unscored round are already baked into sittingOut.
    // Clear them so they don't re-apply on the next generate. Later toggles
    // (after a score) stay pending for the following round.
    sitRequests: firstScoreInRound ? { sit: [], play: [] } : session.sitRequests,
  }
}

/** Undo the most recently entered score. */
export function undoLastScore(session: Session): Session {
  if (session.scoreLog.length === 0) return session

  const log = [...session.scoreLog]
  const entry = log.pop()!
  const scores = { ...session.scores }
  for (const [id, diff] of Object.entries(entry.deltas)) {
    scores[id] = (scores[id] ?? 0) - diff
  }

  const rounds = session.rounds.map((r, i) => {
    if (i !== entry.roundIndex) return r
    return {
      ...r,
      matches: r.matches.map((m) =>
        m.id === entry.matchId ? { ...m, scoreA: null, scoreB: null } : m,
      ),
    }
  })

  return { ...session, scores, rounds, scoreLog: log }
}

export function gamesPlayed(session: Session, playerId: string): number {
  let n = 0
  for (const round of session.rounds) {
    for (const m of round.matches) {
      if (!isMatchComplete(m)) continue
      if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) {
        n++
      }
    }
  }
  return n
}

export function gamesWon(session: Session, playerId: string): number {
  let n = 0
  for (const round of session.rounds) {
    for (const m of round.matches) {
      if (!isMatchComplete(m)) continue
      const onA = m.teamA.includes(playerId)
      const onB = m.teamB.includes(playerId)
      if (!onA && !onB) continue
      if (onA && m.scoreA! > m.scoreB!) n++
      if (onB && m.scoreB! > m.scoreA!) n++
    }
  }
  return n
}

/** Wins counted only on King’s Court rounds. */
export function kingsCourtWins(session: Session, playerId: string): number {
  let n = 0
  for (const round of session.rounds) {
    if (round.kind !== 'kingsCourt') continue
    for (const m of round.matches) {
      if (!isMatchComplete(m)) continue
      const onA = m.teamA.includes(playerId)
      const onB = m.teamB.includes(playerId)
      if (!onA && !onB) continue
      if (onA && m.scoreA! > m.scoreB!) n++
      if (onB && m.scoreB! > m.scoreA!) n++
    }
  }
  return n
}

function compareStandings(a: Standing, b: Standing): number {
  // Wins first, then point differential, then games played, then name
  if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon
  if (b.points !== a.points) return b.points - a.points
  if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed
  return a.name.localeCompare(b.name)
}

export function computeStandings(session: Session): Standing[] {
  const rows: Standing[] = session.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    points: session.scores[p.id] ?? 0,
    gamesPlayed: gamesPlayed(session, p.id),
    gamesWon: gamesWon(session, p.id),
    kingsCourtWins: kingsCourtWins(session, p.id),
    sitOuts: session.sitOutCounts[p.id] ?? 0,
    rank: 0,
    active: p.active !== false,
  }))

  rows.sort(compareStandings)

  let rank = 1
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) {
      const prev = rows[i - 1]!
      const cur = rows[i]!
      // Shared rank only when wins and differential match
      if (prev.gamesWon !== cur.gamesWon || prev.points !== cur.points) {
        rank = i + 1
      }
    }
    rows[i]!.rank = rank
  }
  return rows
}

export function playerName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? '?'
}

/**
 * Validate a finished-game score.
 * - winBy 1: winner must reach pointsToWin (11–10 OK).
 * - winBy 2: winner must reach pointsToWin AND lead by ≥2 (11–9 OK, 12–10 OK, 11–10 not).
 */
export function validateScoreInput(
  scoreA: number,
  scoreB: number,
  pointsToWin: number,
  winBy: WinBy = 2,
): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return 'Enter whole numbers'
  }
  if (scoreA < 0 || scoreB < 0) return 'Scores cannot be negative'
  if (scoreA === 0 && scoreB === 0) return 'Enter the final score'
  if (scoreA === scoreB) return 'Scores cannot be tied'

  const high = Math.max(scoreA, scoreB)
  const low = Math.min(scoreA, scoreB)
  const margin = high - low
  const maxReasonable = pointsToWin + (winBy === 2 ? 20 : 5)

  if (high > maxReasonable) {
    return `Score looks too high (games to ${pointsToWin})`
  }

  if (high < pointsToWin) {
    return `Need ${pointsToWin} to win`
  }

  if (winBy >= 2 && margin < winBy) {
    return 'Need win by 2'
  }

  // Win-by-2: if both sides are past game-to, margin must still be ≥2
  // (already covered). Also reject "overtime" that skipped the win condition
  // e.g. 13–9 when game-to is 11 (winner jumped past without needing OT).
  // Courtside: allow any valid finish where high >= pointsToWin and margin OK.

  return null
}

/**
 * Sudden death / end-game-now: accept any early finish with a clear winner.
 * Blocks ties. Does not require reaching game-to or win-by margin.
 * Both teams still get the usual point differential via applyScore.
 */
export function validateSuddenDeathScore(scoreA: number, scoreB: number): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return 'Enter whole numbers'
  }
  if (scoreA < 0 || scoreB < 0) return 'Scores cannot be negative'
  if (scoreA === 0 && scoreB === 0) return 'Enter the final score'
  if (scoreA === scoreB) {
    return 'Sudden death needs a winner — scores can’t be tied'
  }
  const high = Math.max(scoreA, scoreB)
  if (high > 99) return 'Score looks too high'
  return null
}

/** True when the score is a valid finished game under the session rules. */
export function isValidFinishedScore(
  scoreA: number,
  scoreB: number,
  pointsToWin: number,
  winBy: WinBy,
): boolean {
  return validateScoreInput(scoreA, scoreB, pointsToWin, winBy) === null
}

/** True when scores are acceptable for an explicit sudden-death finish. */
export function isValidSuddenDeathScore(scoreA: number, scoreB: number): boolean {
  return validateSuddenDeathScore(scoreA, scoreB) === null
}

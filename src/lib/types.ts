export interface Player {
  id: string
  name: string
  /**
   * false = left early (kept for standings/history, excluded from new pairings).
   * undefined/true = active. Migrated sessions default to active.
   */
  active?: boolean
}

export interface Match {
  id: string
  court: number
  teamA: [string, string]
  teamB: [string, string]
  scoreA: number | null
  scoreB: number | null
  /** Optional courtside color commentary */
  comment?: string
}

export interface Round {
  number: number
  matches: Match[]
  sittingOut: string[]
  /** Optional short note for the whole round */
  note?: string
  /** Pairing style for this round. Default americano for older sessions. */
  kind?: PlayPhase
}

export type SessionStatus = 'setup' | 'active' | 'finished'

/** Americano mixer vs optional King’s Court finish. */
export type PlayPhase = 'americano' | 'kingsCourt'

/** How the first King’s Court ladder is seeded. */
export type KingsCourtSeed = 'standings' | 'random'

/** Manager sit/play requests for the next generated round. */
export interface SitRequests {
  /** Must sit (if a court can still be filled). */
  sit: string[]
  /** Prefer they play — unsit / swap a system bye. */
  play: string[]
}

/** Margin required to win a game (1 = first to N, 2 = standard pickleball). */
export type WinBy = 1 | 2

export interface Session {
  id: string
  players: Player[]
  courts: number
  pointsToWin: number
  /** Required lead to finish a game. Default 2. */
  winBy: WinBy
  rounds: Round[]
  currentRoundIndex: number
  status: SessionStatus
  /**
   * Active pairing mode. Default americano (older saved sessions).
   * Switching mid-session starts a King’s Court finish.
   */
  phase?: PlayPhase
  /** Seed used when the first King’s Court round is generated. Default standings. */
  kingsCourtSeed?: KingsCourtSeed
  /**
   * Sit / unsit requests from the Players list.
   * Honored when generating or regenerating a round; pending requests apply
   * to the next round if the current one already has scores.
   */
  sitRequests?: SitRequests
  /** Cumulative point differential per player id (A−B / B−A each match) */
  scores: Record<string, number>
  /** Sit-out counts per player id */
  sitOutCounts: Record<string, number>
  /** Partner pair key "id1|id2" (sorted) -> times partnered */
  partnerCounts: Record<string, number>
  /** Completed match snapshots for undo */
  scoreLog: ScoreEntry[]
  createdAt: string
  /** SportsCenter-style recap script (generated on end / regenerate) */
  recapScript?: string
}

export interface ScoreEntry {
  roundIndex: number
  matchId: string
  scoreA: number
  scoreB: number
  /** Point differential added to each player in that match */
  deltas: Record<string, number>
}

export interface Standing {
  playerId: string
  name: string
  /** Point differential (positive = outscored opponents) */
  points: number
  gamesPlayed: number
  gamesWon: number
  /** Wins during King’s Court rounds only (0 if the night stayed Americano). */
  kingsCourtWins: number
  sitOuts: number
  rank: number
  /** false when player left early */
  active: boolean
}

/** Compact standing row stored with history for list/detail without recomputing. */
export interface HistoryStandingSnapshot {
  playerId: string
  name: string
  /** Point differential at archive time */
  points: number
  rank: number
  gamesPlayed: number
  gamesWon: number
  left?: boolean
}

/**
 * Archived session. Keyed primarily by local calendar `dateKey` (YYYY-MM-DD);
 * `label` disambiguates same-day sessions with time (and #n if needed).
 */
export interface SessionHistoryEntry {
  id: string
  /** Local calendar date, e.g. "2026-09-13" */
  dateKey: string
  /** Display label, e.g. "Sep 13 · 2:30 PM" */
  label: string
  endedAt: string
  playerCount: number
  courts: number
  pointsToWin: number
  winBy: WinBy
  standings: HistoryStandingSnapshot[]
  /** Full session snapshot for Continue / Rematch */
  session: Session
  /** Saved SportsCenter recap for replay */
  recapScript?: string
}

/** Result of a mid-session roster mutation. */
export interface RosterChangeResult {
  session: Session
  ok: boolean
  reason?: string
  /** True when the current unscored round was rebuilt */
  regenerated?: boolean
}

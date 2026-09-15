import { scoringRuleSummary } from '../lib/scoring'
import type { Session, WinBy } from '../lib/types'

interface Props {
  session: Session
  onSetPointsToWin: (n: number) => void
  onSetWinBy: (n: WinBy) => void
  /** Compact title for in-session panel */
  title?: string
}

export function SettingsPanel({
  session,
  onSetPointsToWin,
  onSetWinBy,
  title = 'Settings',
}: Props) {
  const winBy: WinBy = session.winBy === 1 ? 1 : 2
  const summary = scoringRuleSummary(session.pointsToWin, winBy)

  return (
    <section className="card settings-panel">
      <h2>{title}</h2>

      <div className="settings-block">
        <h3>Game to</h3>
        <div className="segmented">
          {[9, 11, 15, 21].map((n) => (
            <button
              key={n}
              type="button"
              className={session.pointsToWin === n ? 'seg active' : 'seg'}
              onClick={() => onSetPointsToWin(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-block">
        <h3>Win by</h3>
        <div className="segmented segmented-2">
          {([1, 2] as WinBy[]).map((n) => (
            <button
              key={n}
              type="button"
              className={winBy === n ? 'seg active' : 'seg'}
              onClick={() => onSetWinBy(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <p className="settings-summary" role="status">
        {summary}
      </p>
      <p className="hint">
        Each player earns the points their team scored that game. Leaderboard ranks by
        games won first (then points, then name). Use <strong>Sudden death</strong> on
        score entry to end a game early with a winner.
      </p>
      <p className="hint">
        Fix a misspelled name under <strong>Players</strong> (Edit on the setup list, or
        Players during a session).
      </p>
    </section>
  )
}

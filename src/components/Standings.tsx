import { useEffect, useRef, useState } from 'react'
import { usedKingsCourt } from '../lib/kingsCourt'
import { computeStandings, formatDifferential } from '../lib/scoring'
import type { Session, Standing } from '../lib/types'

interface Props {
  session: Session
  compact?: boolean
  /** Emphasize placement (medals / larger ranks) */
  showMedals?: boolean
  /** Flash rows whose rank changed since last update */
  highlightChanges?: boolean
}

function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

export function Standings({
  session,
  compact,
  showMedals,
  highlightChanges,
}: Props) {
  const rows = computeStandings(session)
  const showKc = usedKingsCourt(session)
  const prevRanks = useRef<Record<string, number>>({})
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const standingsKey = `${session.scoreLog.length}:${session.currentRoundIndex}:${JSON.stringify(session.scores)}:${session.players.map((p) => `${p.id}:${p.active !== false}`).join(',')}`

  useEffect(() => {
    const nextRows: Standing[] = computeStandings(session)

    if (!highlightChanges) {
      prevRanks.current = Object.fromEntries(nextRows.map((r) => [r.playerId, r.rank]))
      return
    }

    const nextDeltas: Record<string, number> = {}
    const changed = new Set<string>()
    for (const r of nextRows) {
      const prev = prevRanks.current[r.playerId]
      if (prev !== undefined && prev !== r.rank) {
        nextDeltas[r.playerId] = prev - r.rank
        changed.add(r.playerId)
      }
    }
    setDeltas(nextDeltas)
    setFlashIds(changed)
    prevRanks.current = Object.fromEntries(nextRows.map((r) => [r.playerId, r.rank]))

    if (changed.size === 0) return
    const t = window.setTimeout(() => setFlashIds(new Set()), 2200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsKey, highlightChanges])

  return (
    <div className={compact ? 'standings compact' : 'standings'}>
      <h2>{compact ? 'Live placement' : 'Final placement'}</h2>
      {compact && (
        <p className="hint standings-explain">
          Ranked by wins, then +/− differential.
        </p>
      )}
      {!compact && (
        <p className="hint standings-explain">
          Ranked by <strong>games won</strong>, then <strong>point differential</strong>{' '}
          (+/−). Win 11–5 → +6; lose 11–5 → −6. Further ties: games played, then name.
          {showKc
            ? ' King’s Court wins are listed separately; they already count in games won.'
            : ''}
        </p>
      )}
      <ol className="standings-list">
        {rows.map((r) => {
          const medal = showMedals ? medalFor(r.rank) : null
          const delta = deltas[r.playerId] ?? 0
          const flash = flashIds.has(r.playerId)
          return (
            <li
              key={r.playerId}
              className={[
                'standing-row',
                r.rank <= 3 ? `place-${r.rank}` : '',
                flash ? 'rank-flash' : '',
                delta > 0 ? 'rank-up' : '',
                delta < 0 ? 'rank-down' : '',
                !r.active ? 'standing-left' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="rank" aria-label={`Rank ${r.rank}`}>
                {medal ? <span className="medal">{medal}</span> : null}
                #{r.rank}
              </span>
              <span className="name">
                {r.name}
                {!r.active && <span className="left-badge">left</span>}
              </span>
              <span className="pts-col">
                {highlightChanges && delta !== 0 && (
                  <span className="rank-delta" aria-hidden>
                    {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                  </span>
                )}
                <span
                  className={`pts${r.points < 0 ? ' neg' : r.points > 0 ? ' pos' : ''}`}
                  title="Point differential"
                  aria-label={`Differential ${formatDifferential(r.points)}`}
                >
                  {formatDifferential(r.points)}
                </span>
              </span>
              <span className="meta">
                {r.gamesPlayed}g · {r.gamesWon}w
                {showKc ? ` · ${r.kingsCourtWins} kc` : ''}
                {!compact ? ` · ${r.sitOuts} bye` : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

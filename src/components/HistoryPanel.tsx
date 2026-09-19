import { useState } from 'react'
import { formatDifferential, scoringRuleSummary } from '../lib/scoring'
import type { SessionHistoryEntry, WinBy } from '../lib/types'
import { RecapPanel } from './RecapPanel'

interface Props {
  history: SessionHistoryEntry[]
  onContinue: (id: string) => void
  onRematch: (id: string) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onSaveRecap: (historyId: string, script: string) => void
}

export function HistoryPanel({
  history,
  onContinue,
  onRematch,
  onDelete,
  onClearAll,
  onSaveRecap,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  if (history.length === 0) {
    return null
  }

  const selected = selectedId ? history.find((e) => e.id === selectedId) : null

  if (selected) {
    const winBy: WinBy = selected.winBy === 1 ? 1 : 2
    const rule = scoringRuleSummary(selected.pointsToWin, winBy)
    return (
      <section className="card history-detail">
        <button
          type="button"
          className="btn btn-ghost btn-sm history-back"
          onClick={() => {
            setSelectedId(null)
            setConfirmDeleteId(null)
            setConfirmClearAll(false)
          }}
        >
          ← History
        </button>
        <h2>{selected.label}</h2>
        <p className="hint">
          {selected.playerCount} players · {selected.courts} court
          {selected.courts === 1 ? '' : 's'} · {rule}
        </p>

        <ol className="standings-list history-standings">
          {selected.standings.map((r) => (
            <li
              key={r.playerId}
              className={`standing-row${r.rank <= 3 ? ` place-${r.rank}` : ''}${r.left ? ' standing-left' : ''}`}
            >
              <span className="rank">#{r.rank}</span>
              <span className="name">
                {r.name}
                {r.left ? <span className="left-badge">left</span> : null}
              </span>
              <span
                className={`pts${r.points < 0 ? ' neg' : r.points > 0 ? ' pos' : ''}`}
                title="Point differential"
                aria-label={`Differential ${formatDifferential(r.points)}`}
              >
                {formatDifferential(r.points)}
              </span>
              <span className="meta">
                {r.gamesPlayed}g · {r.gamesWon}w
              </span>
            </li>
          ))}
        </ol>

        <RecapPanel
          session={selected.session}
          script={selected.recapScript || selected.session.recapScript}
          onScriptChange={(script) => onSaveRecap(selected.id, script)}
          title="Highlight reel / podcast recap (snarky)"
        />

        <div className="round-actions history-actions">
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg"
            onClick={() => onContinue(selected.id)}
          >
            Continue session
          </button>
          <p className="hint action-hint">
            Restore exact scores &amp; rounds — keep playing from where you left off.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => onRematch(selected.id)}
          >
            Rematch
          </button>
          <p className="hint action-hint">Same players &amp; settings, fresh zeroed scores.</p>

          {confirmDeleteId === selected.id ? (
            <div className="confirm-delete">
              <p className="warn">Delete this saved session?</p>
              <div className="confirm-row">
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  onClick={() => {
                    onDelete(selected.id)
                    setSelectedId(null)
                    setConfirmDeleteId(null)
                  }}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setConfirmDeleteId(selected.id)}
            >
              Delete saved session
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="card history-list">
      <div className="history-list-header">
        <h2>Past sessions</h2>
        {history.length >= 2 && !confirmClearAll && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setConfirmDeleteId(null)
              setConfirmClearAll(true)
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <p className="hint">Saved by date when you end a session. Tap a row to open — or trash to delete.</p>

      {confirmClearAll && (
        <div className="confirm-delete confirm-clear-all">
          <p className="warn">
            Delete all {history.length} saved sessions? This cannot be undone.
          </p>
          <div className="confirm-row">
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => {
                onClearAll()
                setConfirmClearAll(false)
                setConfirmDeleteId(null)
              }}
            >
              Yes, clear all history
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setConfirmClearAll(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="history-rows">
        {history.map((entry) => {
          const top = entry.standings[0]
          const winBy: WinBy = entry.winBy === 1 ? 1 : 2
          const confirming = confirmDeleteId === entry.id

          return (
            <li key={entry.id} className="history-row-wrap">
              {confirming ? (
                <div className="history-row-confirm">
                  <p className="warn">Delete “{entry.label}”?</p>
                  <div className="history-confirm-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        onDelete(entry.id)
                        setConfirmDeleteId(null)
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="history-row-line">
                  <button
                    type="button"
                    className="history-row"
                    onClick={() => {
                      setConfirmClearAll(false)
                      setSelectedId(entry.id)
                    }}
                  >
                    <div className="history-row-main">
                      <span className="history-label">{entry.label}</span>
                      <span className="history-meta">
                        {entry.playerCount}p · {entry.courts}c · to {entry.pointsToWin}{' '}
                        (by {winBy})
                      </span>
                    </div>
                    {top && (
                      <span className="history-leader">
                        #{top.rank} {top.name} · {formatDifferential(top.points)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm history-trash"
                    aria-label={`Delete ${entry.label}`}
                    title="Delete saved session"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setConfirmClearAll(false)
                      setConfirmDeleteId(entry.id)
                    }}
                  >
                    🗑
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

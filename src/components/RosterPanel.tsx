import { useState, type FormEvent } from 'react'
import { activePlayers, playerSitState, sitOutHint, suggestedCourts } from '../lib/schedule'
import { canContinuePlay } from '../lib/session'
import type { Session } from '../lib/types'
import { PlayerNameEdit } from './PlayerNameEdit'

interface Props {
  session: Session
  /** Player ids sitting out the current round */
  sittingOutIds?: string[]
  onAdd: (name: string) => string | null
  onToggleSit: (id: string) => string | null
  onRename: (id: string, name: string) => string | null
}

export function RosterPanel({
  session,
  sittingOutIds = [],
  onAdd,
  onToggleSit,
  onRename,
}: Props) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = activePlayers(session)
  const left = session.players.filter((p) => p.active === false)
  const playCheck = canContinuePlay(session)
  const tipCourts = suggestedCourts(active.length, session.courts)
  const sittingSet = new Set(sittingOutIds)
  const byeHint = sitOutHint(active.length, session.courts)

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!name.trim()) return
    const resultMsg = onAdd(name)
    if (resultMsg && resultMsg.startsWith('ERR:')) {
      setError(resultMsg.slice(4))
    } else {
      setMessage(resultMsg)
      setName('')
    }
  }

  function handleSit(id: string) {
    setError(null)
    setMessage(null)
    const resultMsg = onToggleSit(id)
    if (resultMsg && resultMsg.startsWith('ERR:')) {
      setError(resultMsg.slice(4))
    } else if (resultMsg) {
      setMessage(resultMsg)
    }
  }

  return (
    <section className="card roster-panel">
      <h2>Players ({active.length} active)</h2>
      <p className="hint">
        Late arrivals join with 0 points. <strong>Sit</strong> benches someone for this
        (or the next) round — they stay in the session. Highlighted Sit means they’re
        sat (manual or a system bye); tap again to unsit and sit someone else.
        Tap Edit to fix a misspelled name.
      </p>

      <form className="add-row" onSubmit={handleAdd}>
        <input
          className="input"
          type="text"
          enterKeyHint="done"
          placeholder="Add player"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoComplete="off"
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={!name.trim() || session.players.length >= 16}
        >
          Add
        </button>
      </form>

      {byeHint && <p className="hint sitout-hint">{byeHint}</p>}

      {tipCourts !== session.courts && (
        <p className="hint">
          Tip: with {active.length} players, {tipCourts} court
          {tipCourts === 1 ? '' : 's'} may fit better (you’re on {session.courts}).
        </p>
      )}

      {!playCheck.ok && (
        <p className="warn" role="status">
          {playCheck.reason}
        </p>
      )}

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {message && !error && (
        <p className="roster-msg" role="status">
          {message}
        </p>
      )}

      <ul className="player-list roster-list">
        {active.map((p) => {
          const sit = playerSitState(session, p.id)
          const sitting = sittingSet.has(p.id) || sit.sittingNow
          const badge = sit.sittingNow ? (
            <span className="sitting-badge">sitting</span>
          ) : sit.pendingSit ? (
            <span className="sitting-badge">sits next</span>
          ) : null
          return (
            <li
              key={p.id}
              className={sitting || sit.pendingSit ? 'player-sitting player-list-item' : 'player-list-item'}
            >
              <PlayerNameEdit name={p.name} onSave={(next) => onRename(p.id, next)} badge={badge} />
              <span className="roster-pts">{session.scores[p.id] ?? 0} pts</span>
              <button
                type="button"
                className={`btn btn-sm btn-sit${sit.highlight ? ' sit-active' : ''}`}
                onClick={() => handleSit(p.id)}
                aria-pressed={sit.highlight}
                aria-label={sit.highlight ? `${p.name} is sitting — tap to unsit` : `Sit ${p.name}`}
                title={
                  sit.sittingNow && sit.pendingPlay
                    ? 'Sitting this round · will play next'
                    : sit.pendingSit
                      ? 'Will sit next round'
                      : sit.sittingNow
                        ? 'Sitting this round'
                        : 'Sit this / next round'
                }
              >
                Sit
              </button>
            </li>
          )
        })}
        {left.map((p) => (
          <li key={p.id} className="player-left player-list-item">
            <PlayerNameEdit
              name={p.name}
              onSave={(next) => onRename(p.id, next)}
              badge={<span className="left-badge">left</span>}
            />
            <span className="roster-pts">{session.scores[p.id] ?? 0} pts</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

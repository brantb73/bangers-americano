import { useState, type FormEvent } from 'react'
import { activePlayers, sitOutHint, suggestedCourts } from '../lib/schedule'
import { canContinuePlay } from '../lib/session'
import type { Session } from '../lib/types'
import { PlayerNameEdit } from './PlayerNameEdit'

interface Props {
  session: Session
  /** Player ids sitting out the current round */
  sittingOutIds?: string[]
  onAdd: (name: string) => string | null
  onLeave: (id: string) => string | null
  onRename: (id: string, name: string) => string | null
}

export function RosterPanel({
  session,
  sittingOutIds = [],
  onAdd,
  onLeave,
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

  function handleLeave(id: string, playerName: string) {
    setError(null)
    setMessage(null)
    const resultMsg = onLeave(id)
    if (resultMsg && resultMsg.startsWith('ERR:')) {
      setError(resultMsg.slice(4))
    } else {
      setMessage(resultMsg ?? `${playerName} left — round updated`)
    }
  }

  return (
    <section className="card roster-panel">
      <h2>Players ({active.length} active)</h2>
      <p className="hint">
        Late arrivals join with 0 points. Someone leaving keeps their points on the
        board (marked left). Tap Edit to fix a misspelled name.
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
          const sitting = sittingSet.has(p.id)
          return (
            <li key={p.id} className={sitting ? 'player-sitting player-list-item' : 'player-list-item'}>
              <PlayerNameEdit
                name={p.name}
                onSave={(next) => onRename(p.id, next)}
                badge={sitting ? <span className="sitting-badge">sitting</span> : null}
              />
              <span className="roster-pts">{session.scores[p.id] ?? 0} pts</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleLeave(p.id, p.name)}
                aria-label={`Remove ${p.name}`}
              >
                Leave
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

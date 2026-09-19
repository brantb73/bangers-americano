import { useState, type FormEvent } from 'react'
import { sitOutHint } from '../lib/schedule'
import { canStart } from '../lib/session'
import type { Session, SessionHistoryEntry, WinBy } from '../lib/types'
import { DataTransferPanel } from './DataTransferPanel'
import { HistoryPanel } from './HistoryPanel'
import { BrandLogo } from './BrandLogo'
import { PlayerNameEdit } from './PlayerNameEdit'
import { SettingsPanel } from './SettingsPanel'

interface Props {
  session: Session
  history: SessionHistoryEntry[]
  onAddPlayer: (name: string) => string | null
  onRemovePlayer: (id: string) => void
  onRenamePlayer: (id: string, name: string) => string | null
  onSetCourts: (n: number) => void
  onSetPointsToWin: (n: number) => void
  onSetWinBy: (n: WinBy) => void
  onStart: () => void
  onContinueHistory: (id: string) => void
  onRematchHistory: (id: string) => void
  onDeleteHistory: (id: string) => void
  onClearHistory: () => void
  onSaveHistoryRecap: (historyId: string, script: string) => void
  onDataImported: (next: { session: Session; history: SessionHistoryEntry[] }) => void
}

export function SetupScreen({
  session,
  history,
  onAddPlayer,
  onRemovePlayer,
  onRenamePlayer,
  onSetCourts,
  onSetPointsToWin,
  onSetWinBy,
  onStart,
  onContinueHistory,
  onRematchHistory,
  onDeleteHistory,
  onClearHistory,
  onSaveHistoryRecap,
  onDataImported,
}: Props) {
  const [name, setName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const check = canStart(session)
  const byeHint = sitOutHint(session.players.length, session.courts)

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const err = onAddPlayer(name)
    if (err) {
      setAddError(err)
      return
    }
    setAddError(null)
    setName('')
  }

  return (
    <div className="screen setup">
      <header className="hero">
        <BrandLogo size="large" />
        <p className="tagline">Americano · rotating partners · cumulative points</p>
      </header>

      <section className="card help-blurb">
        <p>
          After each game, every player <strong>banks their team’s points</strong>. Live
          standings rank by <strong>wins first</strong>, with points breaking ties — watch
          placement move as rounds go on.
        </p>
        <p>
          Optional hybrid night: start as an Americano mixer, then tap{' '}
          <strong>Switch to King’s Court</strong> to finish — Court 1 is the throne,
          winners move up, losers move down, partners split.
        </p>
        <p className="hint device-hint" role="note">
          Sessions are saved on this device/browser only — use Export/Import to move them.
        </p>
      </section>

      <DataTransferPanel
        session={session}
        history={history}
        onImported={onDataImported}
      />

      <HistoryPanel
        history={history}
        onContinue={onContinueHistory}
        onRematch={onRematchHistory}
        onDelete={onDeleteHistory}
        onClearAll={onClearHistory}
        onSaveRecap={onSaveHistoryRecap}
      />

      <section className="card">
        <h2>Players ({session.players.length})</h2>
        <p className="hint">Typical: 8–16. Need at least 4. Tap Edit to fix a misspelled name.</p>
        <form className="add-row" onSubmit={handleAdd}>
          <input
            className="input"
            type="text"
            enterKeyHint="done"
            placeholder="Player name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setAddError(null)
            }}
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
        {addError && (
          <p className="warn" role="alert">
            {addError}
          </p>
        )}
        <ul className="player-list">
          {session.players.map((p, i) => (
            <li key={p.id} className="player-list-item">
              <span className="player-num">{i + 1}</span>
              <PlayerNameEdit
                name={p.name}
                onSave={(next) => onRenamePlayer(p.id, next)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRemovePlayer(p.id)}
                aria-label={`Remove ${p.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Courts</h2>
        <div className="segmented">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={session.courts === n ? 'seg active' : 'seg'}
              onClick={() => onSetCourts(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {byeHint && (
          <p className="hint sitout-hint" role="status">
            {byeHint}
          </p>
        )}
      </section>

      <SettingsPanel
        session={session}
        onSetPointsToWin={onSetPointsToWin}
        onSetWinBy={onSetWinBy}
      />

      {!check.ok && session.players.length > 0 && (
        <p className="warn" role="status">
          {check.reason}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block btn-lg"
        disabled={!check.ok}
        onClick={onStart}
      >
        Start session
      </button>
    </div>
  )
}

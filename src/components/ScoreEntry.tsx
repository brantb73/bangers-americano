import { useState } from 'react'
import {
  playerName,
  validateScoreInput,
  validateSuddenDeathScore,
} from '../lib/scoring'
import type { Match, Player, WinBy } from '../lib/types'

interface Props {
  match: Match
  players: Player[]
  pointsToWin: number
  winBy: WinBy
  onSubmit: (scoreA: number, scoreB: number) => void
  onSaveComment?: (comment: string) => void
  /** Allow editing comments (active session or history) */
  commentsEditable?: boolean
  /** Allow correcting a saved score. Default true. */
  scoresEditable?: boolean
  /** Override default “Court N” label (e.g. Court 1 · King’s). */
  courtLabel?: string
  /** Who moves where after this game. */
  movementHint?: string
  /** Named movers once the score is in. */
  resultMoveNote?: string | null
  /** Extra class on the card (King’s Court throne styling). */
  cardClassName?: string
  /** Tap a name to start or complete a lineup swap. Omit to show plain names. */
  onSelectPlayer?: (playerId: string) => void
  selectedPlayerId?: string | null
}

export function ScoreEntry({
  match,
  players,
  pointsToWin,
  winBy,
  onSubmit,
  onSaveComment,
  commentsEditable = true,
  scoresEditable = true,
  courtLabel,
  movementHint,
  resultMoveNote,
  cardClassName,
  onSelectPlayer,
  selectedPlayerId,
}: Props) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmSudden, setConfirmSudden] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const [draft, setDraft] = useState(match.comment ?? '')
  const [editingScore, setEditingScore] = useState(false)

  const done = match.scoreA !== null && match.scoreB !== null
  const hasComment = Boolean(match.comment?.trim())
  const showForm = !done || editingScore
  const locked = match.scoreA !== null || match.scoreB !== null

  function PlayerChip({ id }: { id: string }) {
    const label = playerName(players, id)
    if (!onSelectPlayer) return <div>{label}</div>
    const selected = selectedPlayerId === id
    return (
      <button
        type="button"
        className={`player-chip${selected ? ' selected' : ''}${locked ? ' locked' : ''}`}
        aria-pressed={selected}
        aria-label={selected ? `${label}, selected to swap` : `Swap ${label}`}
        onClick={() => onSelectPlayer(id)}
      >
        {label}
      </button>
    )
  }

  function parseScores(): { scoreA: number; scoreB: number } | null {
    const scoreA = Number(a)
    const scoreB = Number(b)
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      setError('Enter whole numbers')
      setConfirmSudden(false)
      return null
    }
    if (scoreA < 0 || scoreB < 0) {
      setError('Scores cannot be negative')
      setConfirmSudden(false)
      return null
    }
    return { scoreA, scoreB }
  }

  function finishSubmit(scoreA: number, scoreB: number) {
    setError(null)
    setConfirmSudden(false)
    setEditingScore(false)
    onSubmit(scoreA, scoreB)
  }

  function trySubmit() {
    const parsed = parseScores()
    if (!parsed) return
    const { scoreA, scoreB } = parsed

    if (scoreA === 0 && scoreB === 0) {
      setError('Enter the final score')
      setConfirmSudden(false)
      return
    }

    const err = validateScoreInput(scoreA, scoreB, pointsToWin, winBy)
    if (err) {
      setError(err)
      setConfirmSudden(false)
      return
    }
    finishSubmit(scoreA, scoreB)
  }

  function trySuddenDeath() {
    const parsed = parseScores()
    if (!parsed) return
    const { scoreA, scoreB } = parsed

    const err = validateSuddenDeathScore(scoreA, scoreB)
    if (err) {
      setError(err)
      setConfirmSudden(false)
      return
    }

    // If the score already passes normal rules, just save — no need for sudden death
    if (validateScoreInput(scoreA, scoreB, pointsToWin, winBy) === null) {
      finishSubmit(scoreA, scoreB)
      return
    }

    if (!confirmSudden) {
      setConfirmSudden(true)
      setError(
        `End game now at ${scoreA}–${scoreB}? Sudden death needs a winner (no ties). Differential is still the score gap (e.g. 6–5 → +1 / −1).`,
      )
      return
    }

    finishSubmit(scoreA, scoreB)
  }

  function onScoreChange(which: 'a' | 'b', raw: string) {
    const v = raw.replace(/\D/g, '').slice(0, 2)
    if (which === 'a') setA(v)
    else setB(v)
    setError(null)
    setConfirmSudden(false)
  }

  function startEditScore() {
    setA(String(match.scoreA ?? ''))
    setB(String(match.scoreB ?? ''))
    setError(null)
    setConfirmSudden(false)
    setEditingComment(false)
    setEditingScore(true)
  }

  function cancelEditScore() {
    setError(null)
    setConfirmSudden(false)
    setEditingScore(false)
  }

  function saveComment() {
    onSaveComment?.(draft)
    setEditingComment(false)
  }

  const form = (
    <>
      {editingScore ? <p className="hint score-edit-hint">Correct this court’s score</p> : null}
      {movementHint ? <p className="movement-hint">{movementHint}</p> : null}
      <div className="score-entry-grid">
        <div className="team-col">
          <div className="team-names">
            <PlayerChip id={match.teamA[0]} />
            <PlayerChip id={match.teamA[1]} />
          </div>
          <input
            className="input score-input"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={a}
            onChange={(e) => onScoreChange('a', e.target.value)}
            aria-label="Team A score"
            autoFocus={editingScore}
          />
        </div>
        <div className="vs">vs</div>
        <div className="team-col">
          <div className="team-names">
            <PlayerChip id={match.teamB[0]} />
            <PlayerChip id={match.teamB[1]} />
          </div>
          <input
            className="input score-input"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={b}
            onChange={(e) => onScoreChange('b', e.target.value)}
            aria-label="Team B score"
          />
        </div>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={trySubmit}>
        Save score
      </button>
      <button
        type="button"
        className={`btn btn-block ${confirmSudden ? 'btn-danger' : 'btn-ghost'}`}
        onClick={trySuddenDeath}
      >
        {confirmSudden ? 'Confirm sudden death' : 'Sudden death — end game now'}
      </button>
      {editingScore && (
        <button type="button" className="btn btn-ghost btn-block" onClick={cancelEditScore}>
          Cancel
        </button>
      )}
      {!confirmSudden && (
        <p className="hint sudden-hint">
          Early finish (e.g. 5–6): needs a winner, no ties. Differential is the score gap
          (6–5 → +1 / −1).
        </p>
      )}
    </>
  )

  if (showForm) {
    return (
      <div className={`match-card ${editingScore ? 'editing' : ''} ${cardClassName ?? ''}`.trim()}>
        <div className="court-label">{courtLabel ?? `Court ${match.court}`}</div>
        {form}
      </div>
    )
  }

  return (
    <div className={`match-card scored ${cardClassName ?? ''}`.trim()}>
      <div className="court-label">
        {courtLabel ?? `Court ${match.court}`}
        {hasComment && !editingComment && (
          <span className="comment-indicator" title={match.comment}>
            💬
          </span>
        )}
      </div>
      <div className="score-result">
        <div className="team">
          <PlayerChip id={match.teamA[0]} />
          <PlayerChip id={match.teamA[1]} />
        </div>
        {scoresEditable ? (
          <button
            type="button"
            className="score-big score-edit-tap"
            onClick={startEditScore}
            aria-label={`Edit score ${match.scoreA} to ${match.scoreB}`}
          >
            {match.scoreA} – {match.scoreB}
          </button>
        ) : (
          <div className="score-big">
            {match.scoreA} – {match.scoreB}
          </div>
        )}
        <div className="team">
          <PlayerChip id={match.teamB[0]} />
          <PlayerChip id={match.teamB[1]} />
        </div>
      </div>
      {resultMoveNote ? <p className="move-note">{resultMoveNote}</p> : null}
      {hasComment && !editingComment && (
        <p className="match-comment-preview">“{match.comment}”</p>
      )}

      {scoresEditable && (
        <button type="button" className="btn btn-secondary btn-block" onClick={startEditScore}>
          Edit score
        </button>
      )}

      {commentsEditable && onSaveComment && (
        <>
          {editingComment ? (
            <div className="comment-editor">
              <textarea
                className="input comment-textarea"
                rows={3}
                maxLength={280}
                placeholder="Courtside comment…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <div className="comment-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={saveComment}>
                  Save comment
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDraft(match.comment ?? '')
                    setEditingComment(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-block"
              onClick={() => {
                setDraft(match.comment ?? '')
                setEditingComment(true)
              }}
            >
              {hasComment ? 'Edit comment' : 'Add comment'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

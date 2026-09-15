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
}

export function ScoreEntry({
  match,
  players,
  pointsToWin,
  winBy,
  onSubmit,
  onSaveComment,
  commentsEditable = true,
}: Props) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmSudden, setConfirmSudden] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const [draft, setDraft] = useState(match.comment ?? '')

  const done = match.scoreA !== null && match.scoreB !== null
  const hasComment = Boolean(match.comment?.trim())

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
    setError(null)
    setConfirmSudden(false)
    onSubmit(scoreA, scoreB)
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
      setError(null)
      setConfirmSudden(false)
      onSubmit(scoreA, scoreB)
      return
    }

    if (!confirmSudden) {
      setConfirmSudden(true)
      setError(
        `End game now at ${scoreA}–${scoreB}? Sudden death needs a winner (no ties). Both teams still bank their points.`,
      )
      return
    }

    setError(null)
    setConfirmSudden(false)
    onSubmit(scoreA, scoreB)
  }

  function onScoreChange(which: 'a' | 'b', raw: string) {
    const v = raw.replace(/\D/g, '').slice(0, 2)
    if (which === 'a') setA(v)
    else setB(v)
    setError(null)
    setConfirmSudden(false)
  }

  function saveComment() {
    onSaveComment?.(draft)
    setEditingComment(false)
  }

  if (done) {
    return (
      <div className="match-card scored">
        <div className="court-label">
          Court {match.court}
          {hasComment && !editingComment && (
            <span className="comment-indicator" title={match.comment}>
              💬
            </span>
          )}
        </div>
        <div className="score-result">
          <div className="team">
            <div>{playerName(players, match.teamA[0])}</div>
            <div>{playerName(players, match.teamA[1])}</div>
          </div>
          <div className="score-big">
            {match.scoreA} – {match.scoreB}
          </div>
          <div className="team">
            <div>{playerName(players, match.teamB[0])}</div>
            <div>{playerName(players, match.teamB[1])}</div>
          </div>
        </div>

        {hasComment && !editingComment && (
          <p className="match-comment-preview">“{match.comment}”</p>
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

  return (
    <div className="match-card">
      <div className="court-label">Court {match.court}</div>
      <div className="score-entry-grid">
        <div className="team-col">
          <div className="team-names">
            <div>{playerName(players, match.teamA[0])}</div>
            <div>&amp; {playerName(players, match.teamA[1])}</div>
          </div>
          <input
            className="input score-input"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={a}
            onChange={(e) => onScoreChange('a', e.target.value)}
            aria-label="Team A score"
          />
        </div>
        <div className="vs">vs</div>
        <div className="team-col">
          <div className="team-names">
            <div>{playerName(players, match.teamB[0])}</div>
            <div>&amp; {playerName(players, match.teamB[1])}</div>
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
      <button type="button" className="btn btn-primary btn-block" onClick={trySubmit}>
        Save score
      </button>
      <button
        type="button"
        className={`btn btn-block ${confirmSudden ? 'btn-danger' : 'btn-ghost'}`}
        onClick={trySuddenDeath}
      >
        {confirmSudden ? 'Confirm sudden death' : 'Sudden death — end game now'}
      </button>
      {!confirmSudden && (
        <p className="hint sudden-hint">
          Early finish (e.g. 5–6): needs a winner, no ties. Both sides still bank points.
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import {
  courtMovementHint,
  courtTitle,
  describeMatchMovement,
  kingsCourtMatchCourts,
} from '../lib/kingsCourt'
import { activePlayers } from '../lib/schedule'
import { isRoundComplete, scoringRuleSummary } from '../lib/scoring'
import { canContinuePlay, canSwitchToKingsCourt } from '../lib/session'
import type { KingsCourtSeed, Session, WinBy } from '../lib/types'
import { RosterPanel } from './RosterPanel'
import { ScoreEntry } from './ScoreEntry'
import { SettingsPanel } from './SettingsPanel'
import { SittingOutCard } from './SittingOutCard'
import { Standings } from './Standings'
import { BrandLogo } from './BrandLogo'

interface Props {
  session: Session
  onSubmitScore: (roundIndex: number, matchId: string, a: number, b: number) => void
  onUndo: () => void
  onNextRound: () => void
  onFinish: () => void
  onSetPointsToWin: (n: number) => void
  onSetWinBy: (n: WinBy) => void
  onAddPlayer: (name: string) => string | null
  onLeavePlayer: (id: string) => string | null
  onSaveComment: (roundIndex: number, matchId: string, comment: string) => void
  onSaveRoundNote: (roundIndex: number, note: string) => void
  onRenamePlayer: (id: string, name: string) => string | null
  onSwitchToKingsCourt: (seed: KingsCourtSeed) => void
}

export function PlayScreen({
  session,
  onSubmitScore,
  onUndo,
  onNextRound,
  onFinish,
  onSetPointsToWin,
  onSetWinBy,
  onAddPlayer,
  onLeavePlayer,
  onSaveComment,
  onSaveRoundNote,
  onRenamePlayer,
  onSwitchToKingsCourt,
}: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const [showRoster, setShowRoster] = useState(false)
  const [showStandings, setShowStandings] = useState(true)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [kcConfirm, setKcConfirm] = useState(false)
  const [kcSeed, setKcSeed] = useState<KingsCourtSeed>('standings')

  const round = session.rounds[session.currentRoundIndex]
  if (!round) {
    return <p className="warn">No round loaded.</p>
  }

  const winBy: WinBy = session.winBy === 1 ? 1 : 2
  const complete = isRoundComplete(session, session.currentRoundIndex)
  const playOk = canContinuePlay(session)
  const sitters = round.sittingOut.map((id) => ({
    id,
    name: session.players.find((p) => p.id === id)?.name ?? '?',
  }))
  const rule = scoringRuleSummary(session.pointsToWin, winBy)
  const activeCount = activePlayers(session).length
  const ri = session.currentRoundIndex
  const isKc = session.phase === 'kingsCourt'
  const switchCheck = canSwitchToKingsCourt(session)
  const kcCourts = isKc ? kingsCourtMatchCourts(session) : session.courts

  return (
    <div className="screen play">
      <header className="top-bar">
        <div>
          <BrandLogo size="compact" />
          <h1>{isKc ? `King’s Court · Round ${round.number}` : `Round ${round.number}`}</h1>
          <p className="tagline">
            {isKc
              ? `Court 1 is King’s · winners up, losers down, partners split · ${rule} · ${kcCourts} court${kcCourts === 1 ? '' : 's'} · ${activeCount} players`
              : `${rule} · ${session.courts} court${session.courts === 1 ? '' : 's'} · ${activeCount} players`}
          </p>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowRoster((v) => !v)
              if (!showRoster) setShowSettings(false)
            }}
            aria-expanded={showRoster}
          >
            Players
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setShowSettings((v) => !v)
              if (!showSettings) setShowRoster(false)
            }}
            aria-expanded={showSettings}
          >
            Settings
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onUndo}
            disabled={session.scoreLog.length === 0}
          >
            Undo
          </button>
        </div>
      </header>

      {showRoster && (
        <RosterPanel
          session={session}
          sittingOutIds={round.sittingOut}
          onAdd={onAddPlayer}
          onLeave={onLeavePlayer}
          onRename={onRenamePlayer}
        />
      )}

      {showSettings && (
        <SettingsPanel
          session={session}
          onSetPointsToWin={onSetPointsToWin}
          onSetWinBy={onSetWinBy}
          title="Session settings"
        />
      )}

      {!playOk.ok && (
        <p className="warn" role="status">
          {playOk.reason}
        </p>
      )}

      <SittingOutCard
        sitters={round.sittingOut.length > 0 ? sitters : []}
        note={
          isKc
            ? 'rotates at the bottom courts, fewest sits first'
            : undefined
        }
      />

      <div className="matches">
        {round.matches.map((m) => (
          <ScoreEntry
            key={m.id}
            match={m}
            players={session.players}
            pointsToWin={session.pointsToWin}
            winBy={winBy}
            onSubmit={(a, b) => onSubmitScore(ri, m.id, a, b)}
            onSaveComment={(c) => onSaveComment(ri, m.id, c)}
            commentsEditable
            courtLabel={isKc ? courtTitle(m.court) : undefined}
            movementHint={isKc ? courtMovementHint(m.court, kcCourts) : undefined}
            resultMoveNote={
              isKc ? describeMatchMovement(m, kcCourts, session.players) : null
            }
            cardClassName={isKc && m.court === 1 ? 'kings-court-card' : undefined}
          />
        ))}
      </div>

      <section className="card round-note-card">
        {editingNote ? (
          <div className="comment-editor">
            <h2>Round note</h2>
            <textarea
              className="input comment-textarea"
              rows={2}
              maxLength={200}
              placeholder="Short note for this round…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              autoFocus
            />
            <div className="comment-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onSaveRoundNote(ri, noteDraft)
                  setEditingNote(false)
                }}
              >
                Save note
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingNote(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {round.note?.trim() ? (
              <p className="match-comment-preview">Round note: “{round.note}”</p>
            ) : (
              <p className="hint" style={{ marginBottom: 8 }}>
                Optional color for the SportsCenter recap.
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-block"
              onClick={() => {
                setNoteDraft(round.note ?? '')
                setEditingNote(true)
              }}
            >
              {round.note?.trim() ? 'Edit round note' : 'Add round note'}
            </button>
          </>
        )}
      </section>

      {complete && (
        <div className="round-actions">
          <div className="round-done-banner" role="status">
            Round complete — check placement below, then continue.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block btn-lg"
            onClick={onNextRound}
            disabled={!playOk.ok}
          >
            Next round
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={onFinish}>
            End session
          </button>
        </div>
      )}

      {!isKc && (
        <section className="card kc-switch-card">
          <h2>King’s Court finish</h2>
          <p className="hint">
            Optional endgame: Court 1 is King’s. Winners move up, losers move down,
            partners split. Points keep banking; King’s Court wins show on the
            board. Final rank is still wins first, then points.
          </p>
          {!switchCheck.ok && (
            <p className="warn" role="status">
              {switchCheck.reason}
            </p>
          )}
          {kcConfirm ? (
            <div className="confirm-row">
              <h3 className="kc-seed-label">Seed the ladder</h3>
              <div className="segmented segmented-2">
                <button
                  type="button"
                  className={kcSeed === 'standings' ? 'seg active' : 'seg'}
                  onClick={() => setKcSeed('standings')}
                >
                  Standings
                </button>
                <button
                  type="button"
                  className={kcSeed === 'random' ? 'seg active' : 'seg'}
                  onClick={() => setKcSeed('random')}
                >
                  Random
                </button>
              </div>
              <p className="hint">
                {kcSeed === 'standings'
                  ? 'Top Americano standings (wins, then points) start toward Court 1.'
                  : 'Shuffle the ladder, then play King’s Court rules.'}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={!switchCheck.ok}
                onClick={() => {
                  onSwitchToKingsCourt(kcSeed)
                  setKcConfirm(false)
                }}
              >
                Start King’s Court
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setKcConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={!switchCheck.ok}
              onClick={() => setKcConfirm(true)}
            >
              Switch to King’s Court
            </button>
          )}
        </section>
      )}

      <section className="card standings-card">
        <div className="standings-toggle-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowStandings((v) => !v)}
            aria-expanded={showStandings}
          >
            {showStandings ? 'Hide placement' : 'Show placement'}
          </button>
        </div>
        {showStandings && (
          <Standings session={session} compact highlightChanges showMedals={complete} />
        )}
      </section>

      {!complete && (
        <button type="button" className="btn btn-ghost btn-block" onClick={onFinish}>
          End session early
        </button>
      )}
    </div>
  )
}

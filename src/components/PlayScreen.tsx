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
  onToggleSit: (id: string) => string | null
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
  onToggleSit,
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
  const [showEarlier, setShowEarlier] = useState(false)

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
  const earlierRounds = session.rounds
    .slice(0, ri)
    .map((r, i) => ({ round: r, index: i }))
    .filter(({ round }) => round.matches.some((m) => m.scoreA !== null && m.scoreB !== null))

  function renderMatches(
    round: (typeof session.rounds)[number],
    roundIndex: number,
    commentsEditable: boolean,
  ) {
    const roundIsKc = round.kind === 'kingsCourt'
    const roundCourts = roundIsKc
      ? Math.max(round.matches.length, 1)
      : session.courts
    return round.matches.map((m) => (
      <ScoreEntry
        key={m.id}
        match={m}
        players={session.players}
        pointsToWin={session.pointsToWin}
        winBy={winBy}
        onSubmit={(a, b) => onSubmitScore(roundIndex, m.id, a, b)}
        onSaveComment={(c) => onSaveComment(roundIndex, m.id, c)}
        commentsEditable={commentsEditable}
        scoresEditable
        courtLabel={roundIsKc ? courtTitle(m.court) : undefined}
        movementHint={roundIsKc ? courtMovementHint(m.court, roundCourts) : undefined}
        resultMoveNote={
          roundIsKc ? describeMatchMovement(m, roundCourts, session.players) : null
        }
        cardClassName={roundIsKc && m.court === 1 ? 'kings-court-card' : undefined}
      />
    ))
  }

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
          onToggleSit={onToggleSit}
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
        {renderMatches(round, ri, true)}
      </div>

      {earlierRounds.length > 0 && (
        <section className="card earlier-rounds-card">
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
          >
            {showEarlier
              ? 'Hide earlier rounds'
              : `Edit earlier rounds (${earlierRounds.length})`}
          </button>
          {showEarlier && (
            <div className="earlier-rounds">
              <p className="hint">
                Tap a score or <strong>Edit score</strong> to correct a court. Placement
                always updates. King’s Court courts rebuild from the corrected round if
                you haven’t scored the next ladder round yet.
              </p>
              {earlierRounds.map(({ round: past, index }) => (
                <div key={past.number} className="earlier-round">
                  <h3>
                    {past.kind === 'kingsCourt'
                      ? `King’s Court · Round ${past.number}`
                      : `Round ${past.number}`}
                  </h3>
                  <div className="matches">{renderMatches(past, index, true)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
            partners split. Differential keeps accumulating; King’s Court wins show
            on the board. Final rank is still wins first, then differential.
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
                  ? 'Top Americano standings (wins, then differential) start toward Court 1.'
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

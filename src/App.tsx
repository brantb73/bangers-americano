import { PlayScreen } from './components/PlayScreen'
import { SetupScreen } from './components/SetupScreen'
import { SummaryScreen } from './components/SummaryScreen'
import { useSession } from './hooks/useSession'
import './App.css'

export default function App() {
  const api = useSession()
  const { session, history, hydrated } = api

  if (!hydrated) {
    return (
      <div className="app-shell">
        <p className="loading">Loading…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {session.status === 'setup' && (
        <SetupScreen
          session={session}
          history={history}
          onAddPlayer={api.addPlayer}
          onRemovePlayer={api.removePlayer}
          onRenamePlayer={api.renamePlayer}
          onSetCourts={api.setCourts}
          onSetPointsToWin={api.setPointsToWin}
          onSetWinBy={api.setWinBy}
          onStart={api.start}
          onContinueHistory={api.continueFromHistoryId}
          onRematchHistory={api.rematchFromHistoryId}
          onDeleteHistory={api.deleteHistoryId}
          onClearHistory={api.clearAllHistory}
          onSaveHistoryRecap={api.saveHistoryRecap}
          onDataImported={api.applyDataImport}
        />
      )}
      {session.status === 'active' && (
        <PlayScreen
          session={session}
          onSubmitScore={api.submitScore}
          onUndo={api.undo}
          onNextRound={api.nextRound}
          onFinish={api.finish}
          onSetPointsToWin={api.setPointsToWin}
          onSetWinBy={api.setWinBy}
          onAddPlayer={api.addPlayerDuringPlay}
          onLeavePlayer={api.leavePlayerDuringPlay}
          onSaveComment={api.saveComment}
          onSaveRoundNote={api.saveRoundNote}
          onRenamePlayer={api.renamePlayer}
        />
      )}
      {session.status === 'finished' && (
        <SummaryScreen
          session={session}
          onContinue={api.continueSession}
          onNewSession={api.newSession}
          onRematch={api.replaySamePlayers}
          onSaveRecap={api.saveRecap}
        />
      )}
    </div>
  )
}

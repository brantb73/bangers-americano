import { usedKingsCourt } from '../lib/kingsCourt'
import { scoringRuleSummary } from '../lib/scoring'
import type { Session, WinBy } from '../lib/types'
import { RecapPanel } from './RecapPanel'
import { Standings } from './Standings'
import { BrandLogo } from './BrandLogo'

interface Props {
  session: Session
  onContinue: () => void
  onNewSession: () => void
  onRematch: () => void
  onSaveRecap: (script: string) => void
}

export function SummaryScreen({
  session,
  onContinue,
  onNewSession,
  onRematch,
  onSaveRecap,
}: Props) {
  const roundsPlayed = session.rounds.filter((r) =>
    r.matches.every((m) => m.scoreA !== null && m.scoreB !== null),
  ).length
  const winBy: WinBy = session.winBy === 1 ? 1 : 2
  const rule = scoringRuleSummary(session.pointsToWin, winBy)
  const hybrid = usedKingsCourt(session)

  return (
    <div className="screen summary">
      <header className="hero">
        <BrandLogo size="large" />
        <h1>Final placement</h1>
        <p className="tagline">
          {hybrid ? 'Americano → King’s Court finish · ' : ''}
          {roundsPlayed} round{roundsPlayed === 1 ? '' : 's'} · {session.players.length}{' '}
          players · {rule}
        </p>
        <p className="hint saved-hint">Saved to history by date — find it on the home screen.</p>
      </header>

      <section className="card">
        <Standings session={session} showMedals />
      </section>

      <RecapPanel
        session={session}
        script={session.recapScript}
        onScriptChange={onSaveRecap}
      />

      <div className="round-actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onContinue}>
          Continue session
        </button>
        <p className="hint action-hint">Keep this scoreboard and add more rounds.</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={onRematch}>
          Rematch
        </button>
        <p className="hint action-hint">Same players &amp; settings, fresh scores.</p>
        <button type="button" className="btn btn-ghost btn-block" onClick={onNewSession}>
          New session
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  archiveSession,
  continueFromHistory,
  clearHistory,
  deleteHistoryEntry,
  loadHistory,
  rematchFromHistory,
  updateHistoryRecap,
} from '../lib/history'
import { generateSportsCenterRecap } from '../lib/recap'
import { applyScore, undoLastScore } from '../lib/scoring'
import {
  addPlayer,
  advanceToNextRound,
  clearSavedSession,
  createEmptySession,
  endSession,
  leavePlayer,
  loadSession,
  removePlayer,
  renamePlayer,
  reopenSession,
  resetToSetup,
  saveSession,
  setCourts,
  setMatchComment,
  setPointsToWin,
  setRecapScript,
  setRoundNote,
  setWinBy,
  startSession,
  switchToKingsCourt,
} from '../lib/session'
import type { KingsCourtSeed, Session, SessionHistoryEntry, WinBy } from '../lib/types'

export function useSession() {
  const [session, setSession] = useState<Session>(() => loadSession() ?? createEmptySession())
  const [history, setHistory] = useState<SessionHistoryEntry[]>(() => loadHistory())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveSession(session)
  }, [session, hydrated])

  const update = useCallback((fn: (s: Session) => Session) => {
    setSession((s) => fn(s))
  }, [])

  return {
    session,
    history,
    hydrated,
    addPlayer: (name: string) => {
      update((s) => addPlayer(s, name).session)
    },
    addPlayerDuringPlay: (name: string): string | null => {
      let msg: string | null = null
      setSession((s) => {
        const result = addPlayer(s, name)
        if (!result.ok) {
          msg = `ERR:${result.reason ?? 'Could not add'}`
          return s
        }
        if (result.regenerated) {
          msg = `${name.trim()} added — round updated`
        } else {
          msg = result.reason ?? `${name.trim()} added`
        }
        return result.session
      })
      return msg
    },
    removePlayer: (id: string) => update((s) => removePlayer(s, id)),
    renamePlayer: (id: string, name: string): string | null => {
      let err: string | null = null
      setSession((s) => {
        const result = renamePlayer(s, id, name)
        if (!result.ok) {
          err = result.reason ?? 'Could not rename'
          return s
        }
        return result.session
      })
      return err
    },
    leavePlayerDuringPlay: (id: string): string | null => {
      let msg: string | null = null
      setSession((s) => {
        const result = leavePlayer(s, id)
        if (!result.ok) {
          msg = `ERR:${result.reason ?? 'Could not remove'}`
          return s
        }
        const name = s.players.find((p) => p.id === id)?.name ?? 'Player'
        msg = result.regenerated ? `${name} left — round updated` : `${name} left`
        return result.session
      })
      return msg
    },
    setCourts: (n: number) => update((s) => setCourts(s, n)),
    setPointsToWin: (n: number) => update((s) => setPointsToWin(s, n)),
    setWinBy: (n: WinBy) => update((s) => setWinBy(s, n)),
    start: () => update((s) => startSession(s)),
    switchToKingsCourt: (seed: KingsCourtSeed = 'standings') =>
      update((s) => switchToKingsCourt(s, seed)),
    submitScore: (roundIndex: number, matchId: string, a: number, b: number) =>
      update((s) => applyScore(s, roundIndex, matchId, a, b)),
    saveComment: (roundIndex: number, matchId: string, comment: string) =>
      update((s) => setMatchComment(s, roundIndex, matchId, comment)),
    saveRoundNote: (roundIndex: number, note: string) =>
      update((s) => setRoundNote(s, roundIndex, note)),
    saveRecap: (script: string) => {
      update((s) => {
        const next = setRecapScript(s, script)
        // Keep history row in sync when finished
        if (next.status === 'finished') {
          archiveSession(next)
          setHistory(loadHistory())
        }
        return next
      })
    },
    undo: () => update((s) => undoLastScore(s)),
    nextRound: () => update((s) => advanceToNextRound(s)),
    finish: () => {
      setSession((s) => {
        const script = s.recapScript?.trim()
          ? s.recapScript
          : generateSportsCenterRecap(s)
        const finished = setRecapScript(endSession(s), script)
        archiveSession(finished)
        setHistory(loadHistory())
        return finished
      })
    },
    continueSession: () => update((s) => reopenSession(s)),
    newSession: () => {
      clearSavedSession()
      setSession(createEmptySession())
    },
    replaySamePlayers: () => update((s) => resetToSetup(s)),
    continueFromHistoryId: (id: string) => {
      const entry = loadHistory().find((e) => e.id === id)
      if (!entry) return
      setSession(continueFromHistory(entry))
    },
    rematchFromHistoryId: (id: string) => {
      const entry = loadHistory().find((e) => e.id === id)
      if (!entry) return
      setSession(rematchFromHistory(entry))
    },
    deleteHistoryId: (id: string) => {
      deleteHistoryEntry(id)
      setHistory(loadHistory())
    },
    clearAllHistory: () => {
      clearHistory()
      setHistory([])
    },
    saveHistoryRecap: (historyId: string, script: string) => {
      updateHistoryRecap(historyId, script)
      setHistory(loadHistory())
    },
    applyDataImport: (next: { session: Session; history: SessionHistoryEntry[] }) => {
      setSession(next.session)
      setHistory(next.history)
    },
  }
}

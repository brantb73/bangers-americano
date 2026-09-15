import { createId } from './ids'
import { computeStandings } from './scoring'
import { normalizeSession, resetToSetup } from './session'
import type {
  HistoryStandingSnapshot,
  Session,
  SessionHistoryEntry,
  WinBy,
} from './types'

export const HISTORY_STORAGE_KEY = 'pickleball-americano-history-v1'

/** Local calendar date YYYY-MM-DD. */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Human label: "Sep 13 · 2:30 PM" (+ " (#2)" when same-day collisions need it). */
export function formatHistoryLabel(date: Date, sameDayOrdinal = 1): string {
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const base = `${datePart} · ${timePart}`
  return sameDayOrdinal > 1 ? `${base} (#${sameDayOrdinal})` : base
}

export function loadHistory(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SessionHistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e) => e && typeof e.id === 'string' && e.session)
      .map(normalizeHistoryEntry)
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
  } catch {
    return []
  }
}

export function saveHistory(entries: SessionHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore quota / private mode
  }
}

export function normalizeHistoryEntry(entry: SessionHistoryEntry): SessionHistoryEntry {
  const session = normalizeSession(entry.session)
  const winBy: WinBy = entry.winBy === 1 ? 1 : session.winBy === 1 ? 1 : 2
  return {
    ...entry,
    winBy,
    pointsToWin: entry.pointsToWin || session.pointsToWin,
    dateKey: entry.dateKey || localDateKey(new Date(entry.endedAt || Date.now())),
    label: entry.label || formatHistoryLabel(new Date(entry.endedAt || Date.now())),
    endedAt: entry.endedAt || new Date().toISOString(),
    playerCount: entry.playerCount || session.players.length,
    courts: entry.courts || session.courts,
    session,
    standings: Array.isArray(entry.standings) && entry.standings.length > 0
      ? entry.standings
      : snapshotStandings(session),
    recapScript: entry.recapScript || session.recapScript,
  }
}

export function snapshotStandings(session: Session): HistoryStandingSnapshot[] {
  return computeStandings(session).map((s) => ({
    playerId: s.playerId,
    name: s.name,
    points: s.points,
    rank: s.rank,
    gamesPlayed: s.gamesPlayed,
    gamesWon: s.gamesWon,
    left: s.active ? undefined : true,
  }))
}

function sameDayOrdinal(
  entries: SessionHistoryEntry[],
  dateKey: string,
  excludeId?: string,
): number {
  const count = entries.filter((e) => e.dateKey === dateKey && e.id !== excludeId).length
  return count + 1
}

/**
 * Archive a finished (or about-to-finish) session.
 * Upserts by session.id so Continue → End updates the same history row.
 * New sessions the same day get a distinct label with time / #n.
 */
export function archiveSession(
  session: Session,
  endedAt: Date = new Date(),
): SessionHistoryEntry {
  const finished: Session = {
    ...normalizeSession(session),
    status: 'finished',
  }
  const entries = loadHistory()
  const dateKey = localDateKey(endedAt)
  const existingIdx = entries.findIndex((e) => e.session.id === finished.id)

  if (existingIdx >= 0) {
    const prev = entries[existingIdx]!
    const updated: SessionHistoryEntry = {
      ...prev,
      dateKey,
      endedAt: endedAt.toISOString(),
      playerCount: finished.players.length,
      courts: finished.courts,
      pointsToWin: finished.pointsToWin,
      winBy: finished.winBy === 1 ? 1 : 2,
      standings: snapshotStandings(finished),
      session: finished,
      recapScript: finished.recapScript || prev.recapScript,
    }
    const next = [...entries]
    next[existingIdx] = updated
    next.sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    saveHistory(next)
    return updated
  }

  const ordinal = sameDayOrdinal(entries, dateKey)
  const entry: SessionHistoryEntry = {
    id: createId('hist'),
    dateKey,
    label: formatHistoryLabel(endedAt, ordinal),
    endedAt: endedAt.toISOString(),
    playerCount: finished.players.length,
    courts: finished.courts,
    pointsToWin: finished.pointsToWin,
    winBy: finished.winBy === 1 ? 1 : 2,
    standings: snapshotStandings(finished),
    session: finished,
    recapScript: finished.recapScript,
  }
  saveHistory([entry, ...entries])
  return entry
}

export function getHistoryEntry(id: string): SessionHistoryEntry | null {
  return loadHistory().find((e) => e.id === id) ?? null
}

export function deleteHistoryEntry(id: string): void {
  saveHistory(loadHistory().filter((e) => e.id !== id))
}

/** Restore full state and set status to active so more rounds can be added. */
export function continueFromHistory(entry: SessionHistoryEntry): Session {
  const session = normalizeSession(entry.session)
  return { ...session, status: 'active' }
}

/** Same roster & settings, fresh scores — returns setup session ready to start. */
export function rematchFromHistory(entry: SessionHistoryEntry): Session {
  return resetToSetup(normalizeSession(entry.session))
}

/** Clear history storage (tests). */
export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Persist a regenerated recap onto a history entry (and its embedded session). */
export function updateHistoryRecap(historyId: string, script: string): SessionHistoryEntry | null {
  const entries = loadHistory()
  const idx = entries.findIndex((e) => e.id === historyId)
  if (idx < 0) return null
  const prev = entries[idx]!
  const trimmed = script.trim()
  const updated: SessionHistoryEntry = {
    ...prev,
    recapScript: trimmed || undefined,
    session: { ...prev.session, recapScript: trimmed || undefined },
  }
  const next = [...entries]
  next[idx] = updated
  saveHistory(next)
  return updated
}

import {
  loadHistory,
  normalizeHistoryEntry,
  saveHistory,
} from './history'
import { normalizeSession, saveSession } from './session'
import type { Session, SessionHistoryEntry } from './types'

export const EXPORT_FORMAT = 'pickleball-americano-export-v1' as const

export interface ExportPayload {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  session: Session | null
  history: SessionHistoryEntry[]
}

export interface ImportOptions {
  /** Replace entire history instead of merging by id */
  replaceAll?: boolean
  /** Also set imported session as the active session (if present) */
  restoreSession?: boolean
}

export interface ImportResult {
  ok: boolean
  error?: string
  historyAdded: number
  historyUpdated: number
  historyTotal: number
  sessionRestored: boolean
  session: Session | null
  history: SessionHistoryEntry[]
}

/** Build export payload for current session and/or history. */
export function buildExportPayload(
  session: Session | null,
  history: SessionHistoryEntry[],
): ExportPayload {
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    session: session ? normalizeSession(session) : null,
    history: history.map((e) => normalizeHistoryEntry(e)),
  }
}

export function exportSessionOnly(session: Session): ExportPayload {
  return buildExportPayload(session, [])
}

export function exportHistoryOnly(history: SessionHistoryEntry[]): ExportPayload {
  return buildExportPayload(null, history)
}

export function exportPayloadToJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function looksLikeSession(v: unknown): v is Session {
  if (!isPlainObject(v)) return false
  return typeof v.id === 'string' && Array.isArray(v.players)
}

function looksLikeHistoryEntry(v: unknown): v is SessionHistoryEntry {
  if (!isPlainObject(v)) return false
  return typeof v.id === 'string' && looksLikeSession(v.session)
}

/**
 * Parse and validate import JSON.
 * Accepts full export payload, a bare session, or a bare history array.
 */
export function parseImportJson(raw: string): {
  ok: true
  payload: ExportPayload
} | {
  ok: false
  error: string
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Invalid JSON — check the paste or file.' }
  }

  // Full export
  if (isPlainObject(parsed) && parsed.format === EXPORT_FORMAT) {
    const session =
      parsed.session === null || parsed.session === undefined
        ? null
        : looksLikeSession(parsed.session)
          ? normalizeSession(parsed.session as Session)
          : null
    if (parsed.session != null && session === null) {
      return { ok: false, error: 'Export has an invalid session object.' }
    }
    const historyRaw = parsed.history
    if (historyRaw !== undefined && !Array.isArray(historyRaw)) {
      return { ok: false, error: 'Export history must be an array.' }
    }
    const history: SessionHistoryEntry[] = []
    for (const item of (historyRaw as unknown[]) ?? []) {
      if (!looksLikeHistoryEntry(item)) {
        return { ok: false, error: 'Export contains an invalid history entry.' }
      }
      history.push(normalizeHistoryEntry(item))
    }
    return {
      ok: true,
      payload: {
        format: EXPORT_FORMAT,
        exportedAt:
          typeof parsed.exportedAt === 'string'
            ? parsed.exportedAt
            : new Date().toISOString(),
        session,
        history,
      },
    }
  }

  // Bare session
  if (looksLikeSession(parsed)) {
    return {
      ok: true,
      payload: {
        format: EXPORT_FORMAT,
        exportedAt: new Date().toISOString(),
        session: normalizeSession(parsed),
        history: [],
      },
    }
  }

  // Bare history array
  if (Array.isArray(parsed)) {
    const history: SessionHistoryEntry[] = []
    for (const item of parsed) {
      if (!looksLikeHistoryEntry(item)) {
        return { ok: false, error: 'History array has an invalid entry.' }
      }
      history.push(normalizeHistoryEntry(item))
    }
    return {
      ok: true,
      payload: {
        format: EXPORT_FORMAT,
        exportedAt: new Date().toISOString(),
        session: null,
        history,
      },
    }
  }

  return {
    ok: false,
    error:
      'Unrecognized format. Expect a pickleball-americano export, a session, or a history array.',
  }
}

/** Merge imported history into existing by entry id. */
export function mergeHistory(
  existing: SessionHistoryEntry[],
  incoming: SessionHistoryEntry[],
  replaceAll: boolean,
): { history: SessionHistoryEntry[]; added: number; updated: number } {
  if (replaceAll) {
    const history = incoming
      .map((e) => normalizeHistoryEntry(e))
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    return { history, added: history.length, updated: 0 }
  }

  const byId = new Map(existing.map((e) => [e.id, e]))
  let added = 0
  let updated = 0
  for (const entry of incoming) {
    const normalized = normalizeHistoryEntry(entry)
    if (byId.has(normalized.id)) {
      byId.set(normalized.id, normalized)
      updated++
    } else {
      byId.set(normalized.id, normalized)
      added++
    }
  }
  const history = [...byId.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt))
  return { history, added, updated }
}

/**
 * Apply a validated import payload to localStorage + return new state pieces.
 * Does not touch React — caller applies returned session/history.
 */
export function applyImport(
  payload: ExportPayload,
  currentSession: Session,
  currentHistory: SessionHistoryEntry[],
  options: ImportOptions = {},
): ImportResult {
  const replaceAll = Boolean(options.replaceAll)
  const restoreSession = Boolean(options.restoreSession)

  const { history, added, updated } = mergeHistory(
    currentHistory,
    payload.history,
    replaceAll,
  )
  saveHistory(history)

  let session = currentSession
  let sessionRestored = false
  if (restoreSession && payload.session) {
    session = normalizeSession(payload.session)
    saveSession(session)
    sessionRestored = true
  }

  return {
    ok: true,
    historyAdded: added,
    historyUpdated: updated,
    historyTotal: history.length,
    sessionRestored,
    session,
    history,
  }
}

/** Trigger a JSON file download in the browser. */
export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Convenience: reload history after external save (tests). */
export function readStoredHistory(): SessionHistoryEntry[] {
  return loadHistory()
}

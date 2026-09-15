import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archiveSession, clearHistory, loadHistory } from './history'
import { applyScore } from './scoring'
import { createEmptySession, startSession, STORAGE_KEY } from './session'
import {
  applyImport,
  buildExportPayload,
  EXPORT_FORMAT,
  exportPayloadToJson,
  mergeHistory,
  parseImportJson,
} from './transfer'
import type { Player, Session } from './types'

function makeFinished(): Session {
  const players: Player[] = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
    active: true,
  }))
  let session = startSession({
    ...createEmptySession(),
    players,
    courts: 1,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    sitOutCounts: Object.fromEntries(players.map((p) => [p.id, 0])),
  })
  const match = session.rounds[0]!.matches[0]!
  session = applyScore(session, 0, match.id, 11, 7)
  return { ...session, status: 'finished' }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('export payload', () => {
  it('has format version, session, and history', () => {
    const finished = makeFinished()
    const entry = archiveSession(finished)
    const payload = buildExportPayload(finished, [entry])
    expect(payload.format).toBe(EXPORT_FORMAT)
    expect(payload.exportedAt).toMatch(/^\d{4}-/)
    expect(payload.session?.id).toBe(finished.id)
    expect(payload.history).toHaveLength(1)
    expect(payload.history[0]!.id).toBe(entry.id)

    const json = exportPayloadToJson(payload)
    const again = JSON.parse(json)
    expect(again.format).toBe(EXPORT_FORMAT)
    expect(again.history[0].session.players).toHaveLength(4)
  })
})

describe('import parse + merge', () => {
  it('parses full export and merges history by id', () => {
    const a = archiveSession(makeFinished(), new Date(2026, 8, 12, 10, 0, 0))
    const b = archiveSession(makeFinished(), new Date(2026, 8, 13, 10, 0, 0))
    expect(loadHistory()).toHaveLength(2)

    const exportJson = exportPayloadToJson(buildExportPayload(null, [a, b]))
    // Simulate other device with only one overlapping entry
    clearHistory()
    archiveSession(
      { ...makeFinished(), id: 'other-session' },
      new Date(2026, 8, 11, 9, 0, 0),
    )
    const local = loadHistory()
    expect(local).toHaveLength(1)

    const parsed = parseImportJson(exportJson)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // Overwrite one id to force update path
    const incoming = parsed.payload.history.map((e, i) =>
      i === 0 ? { ...e, id: local[0]!.id, label: 'Updated label' } : e,
    )
    const merged = mergeHistory(local, incoming, false)
    expect(merged.updated).toBe(1)
    expect(merged.added).toBe(1)
    expect(merged.history).toHaveLength(2)
    expect(merged.history.find((e) => e.id === local[0]!.id)?.label).toBe('Updated label')
  })

  it('replaceAll wipes and restores session when asked', () => {
    archiveSession(makeFinished())
    archiveSession(makeFinished())
    expect(loadHistory()).toHaveLength(2)

    const finished = makeFinished()
    const entry = archiveSession(finished)
    const only = buildExportPayload(finished, [entry])

    const current = createEmptySession()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))

    const result = applyImport(only, current, loadHistory(), {
      replaceAll: true,
      restoreSession: true,
    })
    expect(result.ok).toBe(true)
    expect(result.historyTotal).toBe(1)
    expect(result.sessionRestored).toBe(true)
    expect(result.session?.id).toBe(finished.id)
    expect(loadHistory()).toHaveLength(1)
  })

  it('rejects garbage with a clear error', () => {
    expect(parseImportJson('not json').ok).toBe(false)
    expect(parseImportJson('{"format":"nope"}').ok).toBe(false)
    const bad = parseImportJson('{"format":"pickleball-americano-export-v1","session":{}}')
    expect(bad.ok).toBe(false)
  })
})

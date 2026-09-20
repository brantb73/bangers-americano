import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  archiveSession,
  clearHistory,
  continueFromHistory,
  deleteHistoryEntry,
  formatHistoryLabel,
  HISTORY_STORAGE_KEY,
  loadHistory,
  localDateKey,
  normalizeHistoryEntry,
  rematchFromHistory,
} from './history'
import { applyScore } from './scoring'
import { advanceToNextRound, createEmptySession, startSession, STORAGE_KEY } from './session'
import type { Player, Session } from './types'

function makeFinishedSession(n = 4): Session {
  const players: Player[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i + 1}`,
  }))
  let session = startSession({
    ...createEmptySession(),
    players,
    courts: 1,
    pointsToWin: 11,
    winBy: 2,
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

describe('localDateKey / labels', () => {
  it('formats local YYYY-MM-DD', () => {
    const d = new Date(2026, 8, 13, 14, 30, 0) // Sep 13 2026 local
    expect(localDateKey(d)).toBe('2026-09-13')
  })

  it('includes time and ordinal for same-day disambiguation', () => {
    const d = new Date(2026, 8, 13, 14, 30, 0)
    const label1 = formatHistoryLabel(d, 1)
    const label2 = formatHistoryLabel(d, 2)
    expect(label1).toMatch(/13/)
    expect(label1).not.toMatch(/#2/)
    expect(label2).toMatch(/#2/)
  })
})

describe('archiveSession', () => {
  it('stores a history entry keyed by local date with standings', () => {
    const session = makeFinishedSession()
    const endedAt = new Date(2026, 8, 13, 14, 30, 0)
    const entry = archiveSession(session, endedAt)

    expect(entry.dateKey).toBe('2026-09-13')
    expect(entry.playerCount).toBe(4)
    expect(entry.courts).toBe(1)
    expect(entry.pointsToWin).toBe(11)
    expect(entry.winBy).toBe(2)
    expect(entry.standings.length).toBe(4)
    expect(entry.standings[0]!.points).toBe(4)
    expect(entry.session.status).toBe('finished')
    expect(entry.session.scores).toEqual(session.scores)

    const loaded = loadHistory()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe(entry.id)
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeTruthy()
  })

  it('does not overwrite a different session on the same day', () => {
    const a = makeFinishedSession()
    const b = makeFinishedSession()
    expect(a.id).not.toBe(b.id)

    const day = new Date(2026, 8, 13, 10, 0, 0)
    const e1 = archiveSession(a, day)
    const e2 = archiveSession(b, new Date(2026, 8, 13, 15, 0, 0))

    const hist = loadHistory()
    expect(hist).toHaveLength(2)
    expect(e1.dateKey).toBe(e2.dateKey)
    expect(e2.label).toMatch(/#2/)
    expect(hist.map((h) => h.session.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('upserts when the same session is archived again (Continue → End)', () => {
    let session = makeFinishedSession()
    const first = archiveSession(session, new Date(2026, 8, 13, 10, 0, 0))
    expect(loadHistory()).toHaveLength(1)

    session = advanceToNextRound({ ...session, status: 'active' })
    const nextMatch = session.rounds[1]!.matches[0]!
    session = applyScore(session, 1, nextMatch.id, 11, 5)
    session = { ...session, status: 'finished' }
    const second = archiveSession(session, new Date(2026, 8, 13, 16, 0, 0))

    const hist = loadHistory()
    expect(hist).toHaveLength(1)
    expect(second.id).toBe(first.id)
    expect(hist[0]!.session.rounds).toHaveLength(2)
    expect(hist[0]!.session.scores).toEqual(session.scores)
  })

  it('recomputes old banked-points standings from match scores on load', () => {
    const session = makeFinishedSession()
    const match = session.rounds[0]!.matches[0]!
    const stale: Session = {
      ...session,
      scores: Object.fromEntries(
        session.players.map((p) => [
          p.id,
          match.teamA.includes(p.id) ? 11 : match.teamB.includes(p.id) ? 7 : 0,
        ]),
      ),
    }
    const raw = {
      id: 'hist-old',
      dateKey: '2026-09-13',
      label: 'Sep 13 · 2:30 PM',
      endedAt: new Date(2026, 8, 13, 14, 30, 0).toISOString(),
      playerCount: 4,
      courts: 1,
      pointsToWin: 11,
      winBy: 2 as const,
      standings: [
        { playerId: match.teamA[0], name: 'P?', points: 11, rank: 1, gamesPlayed: 1, gamesWon: 1 },
      ],
      session: stale,
    }
    const migrated = normalizeHistoryEntry(raw)
    expect(migrated.session.scores[match.teamA[0]]).toBe(4)
    expect(migrated.session.scores[match.teamB[0]]).toBe(-4)
    expect(migrated.standings[0]!.points).toBe(4)
    expect(migrated.standings.find((s) => s.playerId === match.teamB[0])!.points).toBe(-4)
  })
})

describe('continue / rematch / delete', () => {
  it('continueFromHistory restores full state as active', () => {
    const finished = makeFinishedSession()
    const entry = archiveSession(finished)
    const resumed = continueFromHistory(entry)

    expect(resumed.status).toBe('active')
    expect(resumed.id).toBe(finished.id)
    expect(resumed.scores).toEqual(finished.scores)
    expect(resumed.rounds.length).toBe(finished.rounds.length)
    expect(resumed.winBy).toBe(2)
    expect(resumed.pointsToWin).toBe(11)
  })

  it('rematchFromHistory returns setup with same roster/settings and zero scores', () => {
    const finished = makeFinishedSession()
    const entry = archiveSession(finished)
    const rematch = rematchFromHistory(entry)

    expect(rematch.status).toBe('setup')
    expect(rematch.id).not.toBe(finished.id)
    expect(rematch.players.map((p) => p.name)).toEqual(finished.players.map((p) => p.name))
    expect(rematch.courts).toBe(finished.courts)
    expect(rematch.pointsToWin).toBe(11)
    expect(rematch.winBy).toBe(2)
    expect(rematch.rounds).toEqual([])
    expect(Object.values(rematch.scores).every((v) => v === 0)).toBe(true)
  })

  it('deleteHistoryEntry removes only that row', () => {
    const a = archiveSession(makeFinishedSession(), new Date(2026, 8, 12, 9, 0, 0))
    const b = archiveSession(makeFinishedSession(), new Date(2026, 8, 13, 9, 0, 0))
    expect(loadHistory()).toHaveLength(2)

    deleteHistoryEntry(a.id)
    const hist = loadHistory()
    expect(hist).toHaveLength(1)
    expect(hist[0]!.id).toBe(b.id)
  })

  it('clearHistory empties storage without touching active session key', () => {
    archiveSession(makeFinishedSession())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createEmptySession()))
    clearHistory()
    expect(loadHistory()).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })
})

import { useRef, useState } from 'react'
import { shareJsonExport } from '../lib/nativeShare'
import { isIosApp } from '../lib/platform'
import {
  applyImport,
  buildExportPayload,
  copyText,
  exportHistoryOnly,
  exportPayloadToJson,
  exportSessionOnly,
  parseImportJson,
} from '../lib/transfer'
import type { Session, SessionHistoryEntry } from '../lib/types'

interface Props {
  session: Session
  history: SessionHistoryEntry[]
  onImported: (next: { session: Session; history: SessionHistoryEntry[] }) => void
}

export function DataTransferPanel({ session, history, onImported }: Props) {
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [replaceAll, setReplaceAll] = useState(false)
  const [restoreSession, setRestoreSession] = useState(true)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const ios = isIosApp()

  const hasSessionData =
    session.players.length > 0 ||
    session.rounds.length > 0 ||
    session.status !== 'setup'

  function flash(msg: string) {
    setStatus(msg)
    setError(null)
  }

  async function doCopy(label: string, json: string) {
    const ok = await copyText(json)
    flash(ok ? `${label} copied` : `Could not copy — use Download instead`)
  }

  async function exportPayload(filename: string, json: string, downloaded: string, shared: string) {
    const result = await shareJsonExport(filename, json)
    if (result === 'shared') flash(shared)
    else if (result === 'downloaded') flash(downloaded)
    else if (result === 'cancelled') flash('Share cancelled')
    else flash('Could not export — try Copy instead')
  }

  function exportCurrent() {
    const payload = exportSessionOnly(session)
    const json = exportPayloadToJson(payload)
    void exportPayload(
      `americano-session-${payload.exportedAt.slice(0, 10)}.json`,
      json,
      'Current session downloaded',
      'Current session ready to share',
    )
  }

  function exportHistory() {
    const payload = exportHistoryOnly(history)
    const json = exportPayloadToJson(payload)
    void exportPayload(
      `americano-history-${payload.exportedAt.slice(0, 10)}.json`,
      json,
      `History downloaded (${history.length} entries)`,
      `History ready to share (${history.length} entries)`,
    )
  }

  function exportAll() {
    const payload = buildExportPayload(session, history)
    const json = exportPayloadToJson(payload)
    void exportPayload(
      `americano-backup-${payload.exportedAt.slice(0, 10)}.json`,
      json,
      'Full backup downloaded',
      'Full backup ready to share',
    )
  }

  function runImport(raw: string) {
    setError(null)
    setStatus(null)
    const parsed = parseImportJson(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    if (replaceAll && !confirmReplace && parsed.payload.history.length > 0) {
      setConfirmReplace(true)
      setError(null)
      setStatus('Confirm: Replace all will wipe existing history on this device.')
      return
    }

    const result = applyImport(parsed.payload, session, history, {
      replaceAll,
      restoreSession: restoreSession && Boolean(parsed.payload.session),
    })
    onImported({
      session: result.session ?? session,
      history: result.history,
    })
    setPaste('')
    setConfirmReplace(false)

    const parts: string[] = []
    if (result.historyAdded || result.historyUpdated) {
      parts.push(
        `history +${result.historyAdded} new / ${result.historyUpdated} updated (${result.historyTotal} total)`,
      )
    } else if (parsed.payload.history.length === 0) {
      parts.push('no history entries in file')
    } else {
      parts.push(`history unchanged (${result.historyTotal} total)`)
    }
    if (result.sessionRestored) parts.push('active session restored')
    flash(`Import OK — ${parts.join('; ')}`)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      runImport(text)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  return (
    <section className="card data-transfer">
      <h2>Export / Import</h2>
      <p className="hint device-hint" role="note">
        {ios
          ? 'Sessions in the iPhone app stay on this phone. They are separate from bangerstournify.com — Export/Import (the share sheet) moves them.'
          : 'Sessions are saved on this device/browser only — use Export/Import to move them.'}
      </p>

      <h3 className="transfer-sub">Export</h3>
      <div className="transfer-actions">
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={exportCurrent}
          disabled={!hasSessionData}
        >
          {ios ? 'Share current session' : 'Download current session'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={!hasSessionData}
          onClick={() =>
            doCopy('Session JSON', exportPayloadToJson(exportSessionOnly(session)))
          }
        >
          Copy session JSON
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={exportHistory}
          disabled={history.length === 0}
        >
          {ios ? 'Share history' : 'Download history'} ({history.length})
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={history.length === 0}
          onClick={() =>
            doCopy('History JSON', exportPayloadToJson(exportHistoryOnly(history)))
          }
        >
          Copy history JSON
        </button>
        <button type="button" className="btn btn-primary btn-block" onClick={exportAll}>
          {ios ? 'Share full backup' : 'Download full backup'}
        </button>
      </div>

      <h3 className="transfer-sub">Import</h3>
      <label className="transfer-check">
        <input
          type="checkbox"
          checked={restoreSession}
          onChange={(e) => setRestoreSession(e.target.checked)}
        />
        Restore imported session as active
      </label>
      <label className="transfer-check">
        <input
          type="checkbox"
          checked={replaceAll}
          onChange={(e) => {
            setReplaceAll(e.target.checked)
            setConfirmReplace(false)
          }}
        />
        Replace all history (don’t merge)
      </label>

      <textarea
        className="input comment-textarea"
        rows={4}
        placeholder="Paste export JSON here…"
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value)
          setConfirmReplace(false)
        }}
      />

      <div className="transfer-actions">
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          disabled={!paste.trim()}
          onClick={() => runImport(paste)}
        >
          {confirmReplace && replaceAll ? 'Yes, replace & import' : 'Import pasted JSON'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => fileRef.current?.click()}
        >
          Import from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,text/plain"
          className="file-hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {status && !error && (
        <p className="roster-msg" role="status">
          {status}
        </p>
      )}
    </section>
  )
}

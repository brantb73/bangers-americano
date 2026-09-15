import { useEffect, useRef, useState } from 'react'
import { generateSportsCenterRecap } from '../lib/recap'
import { canNativeShare, downloadTextFile, shareText } from '../lib/share'
import {
  isPaused,
  isSpeaking,
  pauseRecap,
  resumeRecap,
  speakRecap,
  speechSupported,
  stopRecap,
} from '../lib/speech'
import {
  canShareFiles,
  downloadBlob,
  fetchTtsAudio,
  shareAudioFile,
  TtsError,
} from '../lib/tts'
import type { Session } from '../lib/types'

interface Props {
  session: Session
  /** Initial / saved script (session or history) */
  script?: string
  onScriptChange: (script: string) => void
  title?: string
}

export function RecapPanel({
  session,
  script,
  onScriptChange,
  title = 'Highlight reel / podcast recap (snarky)',
}: Props) {
  const [localScript, setLocalScript] = useState(script ?? '')
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioTruncated, setAudioTruncated] = useState(false)
  const [hasAudio, setHasAudio] = useState(false)
  const audioBlobRef = useRef<Blob | null>(null)
  const supported = speechSupported()
  const nativeShare = canNativeShare()
  const fileShare = canShareFiles()

  useEffect(() => {
    setLocalScript(script ?? '')
  }, [script])

  useEffect(() => {
    return () => {
      stopRecap()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(msg: string) {
    setStatus(msg)
    window.setTimeout(() => setStatus(null), 2800)
  }

  function ensureScript(): string {
    let text = localScript.trim()
    if (!text) {
      text = generateSportsCenterRecap(session)
      setLocalScript(text)
      onScriptChange(text)
    }
    return text
  }

  function clearAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
    audioBlobRef.current = null
    setHasAudio(false)
    setAudioTruncated(false)
  }

  function generate() {
    stopRecap()
    setPlaying(false)
    setPaused(false)
    clearAudio()
    setAudioError(null)
    const next = generateSportsCenterRecap(session)
    setLocalScript(next)
    onScriptChange(next)
  }

  function play() {
    if (paused && isPaused()) {
      resumeRecap()
      setPaused(false)
      setPlaying(true)
      return
    }
    const text = ensureScript()
    speakRecap(text, {
      onEnd: () => {
        setPlaying(false)
        setPaused(false)
      },
      onError: () => {
        setPlaying(false)
        setPaused(false)
      },
    })
    setPlaying(true)
    setPaused(false)
  }

  function pause() {
    pauseRecap()
    setPaused(true)
    setPlaying(false)
  }

  function stop() {
    stopRecap()
    setPlaying(false)
    setPaused(false)
  }

  async function copy() {
    const text = ensureScript()
    try {
      await navigator.clipboard.writeText(text)
      flash('Copied — paste into Messages')
    } catch {
      flash('Could not copy')
    }
  }

  async function share() {
    const text = ensureScript()
    const result = await shareText('Bangers Highlight Reel', text)
    if (result === 'shared') flash('Shared')
    else if (result === 'copied') flash('Copied — paste into Messages')
    else if (result === 'cancelled') flash('Share cancelled')
    else flash('Could not share — try Copy or Download')
  }

  function download() {
    const text = ensureScript()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`bangers-highlight-reel-${stamp}.txt`, text)
    flash('Downloaded .txt')
  }

  async function generateAudio() {
    const text = ensureScript()
    setAudioBusy(true)
    setAudioError(null)
    flash('Generating audio…')
    try {
      const { blob, truncated } = await fetchTtsAudio(text)
      clearAudio()
      audioBlobRef.current = blob
      setHasAudio(true)
      setAudioUrl(URL.createObjectURL(blob))
      setAudioTruncated(truncated)
      flash(truncated ? 'Audio ready (script truncated for length)' : 'Audio ready')
    } catch (err) {
      const msg =
        err instanceof TtsError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'TTS failed'
      setAudioError(msg)
      flash('Audio failed — see note below')
    } finally {
      setAudioBusy(false)
    }
  }

  function downloadAudio() {
    const blob = audioBlobRef.current
    if (!blob) {
      flash('Generate audio first')
      return
    }
    const stamp = new Date().toISOString().slice(0, 10)
    downloadBlob(blob, `bangers-highlight-reel-${stamp}.mp3`)
    flash('Downloaded .mp3')
  }

  async function shareAudio() {
    let blob = audioBlobRef.current
    if (!blob) {
      setAudioBusy(true)
      setAudioError(null)
      flash('Generating audio…')
      try {
        const result = await fetchTtsAudio(ensureScript())
        clearAudio()
        blob = result.blob
        audioBlobRef.current = blob
        setHasAudio(true)
        setAudioUrl(URL.createObjectURL(blob))
        setAudioTruncated(result.truncated)
      } catch (err) {
        const msg =
          err instanceof TtsError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'TTS failed'
        setAudioError(msg)
        flash('Audio failed — see note below')
        setAudioBusy(false)
        return
      } finally {
        setAudioBusy(false)
      }
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const filename = `bangers-highlight-reel-${stamp}.mp3`
    const result = await shareAudioFile(blob, filename)
    if (result === 'shared') flash('Shared audio')
    else if (result === 'downloaded')
      flash('Audio saved — attach it in Messages')
    else if (result === 'cancelled') flash('Share cancelled')
    else flash('Could not share audio')
  }

  // Auto-generate script once if empty when panel mounts with finished session
  useEffect(() => {
    if (!script?.trim() && session.status === 'finished') {
      const next = generateSportsCenterRecap(session)
      setLocalScript(next)
      onScriptChange(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.status])

  const canAct = Boolean(localScript.trim()) || session.status === 'finished'

  return (
    <section className="card recap-panel">
      <h2>{title}</h2>
      <p className="hint">
        Snarky Bangers highlight-reel podcast from scores, standings, and your courtside
        comments. <strong>Generate audio</strong> makes a real .mp3 (needs the running app
        server). <strong>Share audio</strong> sends the file when the OS allows; otherwise
        it downloads so you can attach it. Web Speech ▶ Play stays as a quick preview.
        {supported ? '' : ' (Browser speech preview not supported.)'}
      </p>

      <div className="recap-toolbar">
        <button type="button" className="btn btn-primary" onClick={generate}>
          {localScript ? 'Regenerate reel' : 'Generate highlight reel'}
        </button>
        {supported && (
          <>
            {!playing || paused ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={play}
                disabled={!canAct}
              >
                {paused ? 'Resume' : '▶ Play preview'}
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={pause}>
                ⏸ Pause
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={stop}
              disabled={!playing && !paused && !isSpeaking()}
            >
              Stop
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void generateAudio()}
          disabled={!canAct || audioBusy}
        >
          {audioBusy ? 'Generating…' : hasAudio ? 'Regenerate audio' : 'Generate audio'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void shareAudio()}
          disabled={!canAct || audioBusy}
        >
          {fileShare ? 'Share audio' : 'Share audio (save)'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={downloadAudio}
          disabled={!hasAudio || audioBusy}
        >
          Download .mp3
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={share}
          disabled={!canAct}
        >
          {nativeShare ? 'Share as text' : 'Share as text (copy)'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={copy} disabled={!canAct}>
          Copy script
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={download}
          disabled={!canAct}
        >
          Download .txt
        </button>
      </div>

      {status && (
        <p className="roster-msg" role="status">
          {status}
        </p>
      )}

      {audioError && (
        <p className="hint recap-audio-error" role="alert">
          Audio error: {audioError}
        </p>
      )}

      {audioUrl && (
        <div className="recap-audio-player">
          <audio controls src={audioUrl} preload="metadata" />
          {audioTruncated && (
            <p className="hint">Script was truncated for TTS length (~4500 chars).</p>
          )}
        </div>
      )}

      {localScript ? (
        <div className="recap-script" role="article">
          {localScript.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : (
        <p className="hint">Tap Generate for the snarky podcast treatment.</p>
      )}
    </section>
  )
}

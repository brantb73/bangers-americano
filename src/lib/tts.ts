/** Client helpers for /api/tts audio generation. */

export const TTS_MAX_CHARS = 4500

export function prepareTtsText(script: string): { text: string; truncated: boolean } {
  const trimmed = script.trim()
  if (!trimmed) return { text: '', truncated: false }
  if (trimmed.length <= TTS_MAX_CHARS) return { text: trimmed, truncated: false }
  const note = '\n\n[Recap truncated for audio length.]'
  const slice = trimmed.slice(0, Math.max(0, TTS_MAX_CHARS - note.length))
  return { text: slice + note, truncated: true }
}

export class TtsError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'TtsError'
    this.status = status
  }
}

/** POST /api/tts — requires the Vite (or preview) server with TTS middleware. */
export async function fetchTtsAudio(script: string): Promise<{
  blob: Blob
  truncated: boolean
  voice: string | null
}> {
  const { text, truncated } = prepareTtsText(script)
  if (!text) throw new TtsError('Nothing to narrate', 400)

  let res: Response
  try {
    res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    throw new TtsError(
      'Could not reach /api/tts — is the app server running? (npm run dev, not static-only hosting)',
      0,
    )
  }

  if (!res.ok) {
    let msg = `TTS failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      // ignore
    }
    throw new TtsError(msg, res.status)
  }

  const blob = await res.blob()
  const voice = res.headers.get('X-TTS-Voice')
  const wasTruncated = truncated || res.headers.get('X-TTS-Truncated') === '1'
  return { blob, truncated: wasTruncated, voice }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function canShareFiles(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  )
}

export type ShareAudioResult = 'shared' | 'downloaded' | 'cancelled' | 'failed'

export async function shareAudioFile(
  blob: Blob,
  filename: string,
  title = 'Bangers Highlight Reel',
): Promise<ShareAudioResult> {
  const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' })

  if (canShareFiles()) {
    try {
      if (navigator.canShare!({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: 'Bangers Americano highlight reel',
        })
        return 'shared'
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'AbortError') return 'cancelled'
    }
  }

  try {
    downloadBlob(blob, filename)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

/** Client helpers for TTS audio generation (hosted worker or same-origin /api/tts). */

export const TTS_MAX_CHARS = 4500
/** Warm conversational US English — podcast host vibe (same as the Vite plugin). */
export const TTS_VOICE = 'en-US-AndrewNeural'
export const LOCAL_TTS_PATH = '/api/tts'

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

/**
 * Resolve where the browser should POST `{ text, voice }`.
 * `VITE_TTS_URL` may be a Worker origin (`https://….workers.dev`) or a full `/tts` URL.
 * Unset / blank falls back to same-origin `/api/tts` (Vite dev + preview).
 */
export function resolveTtsEndpoint(
  remoteUrl: string | undefined = import.meta.env.VITE_TTS_URL,
): string {
  const trimmed = typeof remoteUrl === 'string' ? remoteUrl.trim() : ''
  if (!trimmed) return LOCAL_TTS_PATH
  const noSlash = trimmed.replace(/\/+$/, '')
  return /\/tts$/i.test(noSlash) ? noSlash : `${noSlash}/tts`
}

export function buildTtsRequestBody(text: string, voice = TTS_VOICE): { text: string; voice: string } {
  return { text, voice }
}

export function isLocalTtsEndpoint(endpoint: string): boolean {
  if (endpoint.startsWith('/')) return true
  try {
    const url = new URL(endpoint)
    return url.pathname === LOCAL_TTS_PATH || url.pathname.endsWith(LOCAL_TTS_PATH)
  } catch {
    return false
  }
}

/** Courtside copy when fetch fails (network, static host, or CORS). */
export function unreachableTtsMessage(endpoint: string): string {
  if (isLocalTtsEndpoint(endpoint)) {
    return 'Could not reach /api/tts — is the app server running? (npm run dev, not static-only hosting)'
  }
  return (
    'Courtside audio is blocked — the TTS worker rejected this origin (CORS) or is unreachable. ' +
    'Confirm VITE_TTS_URL and that the worker allows https://brantb73.github.io plus localhost Vite origins.'
  )
}

export type FetchTtsOptions = {
  endpoint?: string
  voice?: string
  fetchImpl?: typeof fetch
}

/** POST JSON `{ text, voice }` — remote Worker when `VITE_TTS_URL` is set, else `/api/tts`. */
export async function fetchTtsAudio(
  script: string,
  options: FetchTtsOptions = {},
): Promise<{
  blob: Blob
  truncated: boolean
  voice: string | null
}> {
  const { text, truncated } = prepareTtsText(script)
  if (!text) throw new TtsError('Nothing to narrate', 400)

  const endpoint = options.endpoint ?? resolveTtsEndpoint()
  const voice = options.voice ?? TTS_VOICE
  const doFetch = options.fetchImpl ?? fetch

  let res: Response
  try {
    res = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTtsRequestBody(text, voice)),
    })
  } catch {
    throw new TtsError(unreachableTtsMessage(endpoint), 0)
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
  const usedVoice = res.headers.get('X-TTS-Voice')
  const wasTruncated = truncated || res.headers.get('X-TTS-Truncated') === '1'
  return { blob, truncated: wasTruncated, voice: usedVoice }
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

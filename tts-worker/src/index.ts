/**
 * Hosted Edge TTS for Bangers recaps.
 * Worker-native WebSocket upgrade to Microsoft's read-aloud endpoint (no paid API).
 */

const DEFAULT_VOICE = 'en-US-AndrewNeural'
const PAGES_ORIGIN = 'https://brantb73.github.io'
const TTS_MAX_CHARS = 4500
const SYNTH_TIMEOUT_MS = 25_000

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0] ?? '143'
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
const SYNTHESIS_URL =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`

type WorkerSocket = WebSocket & { accept(): void }
type UpgradeResponse = Response & { webSocket?: WorkerSocket | null }

function isAllowedOrigin(origin: string): boolean {
  if (origin === PAGES_ORIGIN) return true
  try {
    const url = new URL(origin)
    const local =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return (url.protocol === 'http:' || url.protocol === 'https:') && local
  } catch {
    return false
  }
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-TTS-Voice, X-TTS-Truncated, Content-Type',
    Vary: 'Origin',
  }
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extra?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      ...extra,
    },
  })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stripInvalidXml(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const strip =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    out += strip ? ' ' : ch
  }
  return out
}

function prepareText(raw: string): { text: string; truncated: boolean } {
  const trimmed = raw.trim()
  if (!trimmed) return { text: '', truncated: false }
  if (trimmed.length <= TTS_MAX_CHARS) return { text: trimmed, truncated: false }
  const note = '\n\n[Recap truncated for audio length.]'
  const slice = trimmed.slice(0, Math.max(0, TTS_MAX_CHARS - note.length))
  return { text: slice + note, truncated: true }
}

function hexUuid(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

async function secMsGec(skewSeconds = 0): Promise<string> {
  const winEpoch = 11_644_473_600
  let ticks = Date.now() / 1000 + skewSeconds + winEpoch
  ticks -= ticks % 300
  ticks *= 10_000_000
  const payload = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, -1)
}

function speechConfigMessage(): string {
  return (
    `X-Timestamp:${timestamp()}\r\n` +
    'Content-Type:application/json; charset=utf-8\r\n' +
    'Path:speech.config\r\n\r\n' +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: 'false',
              wordBoundaryEnabled: 'false',
            },
            outputFormat: AUDIO_FORMAT,
          },
        },
      },
    })
  )
}

function ssmlMessage(requestId: string, voice: string, text: string): string {
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="+0%" pitch="+0Hz" volume="+0%">${escapeXml(stripInvalidXml(text))}</prosody>` +
    `</voice></speak>`
  return (
    `X-RequestId:${requestId}\r\n` +
    'Content-Type:application/ssml+xml\r\n' +
    `X-Timestamp:${timestamp()}Z\r\n` +
    'Path:ssml\r\n\r\n' +
    ssml
  )
}

function parseBinaryAudio(data: Uint8Array): Uint8Array | null {
  if (data.length < 2) return null
  const headerLength = (data[0]! << 8) | data[1]!
  if (data.length < 2 + headerLength) return null
  const header = new TextDecoder().decode(data.subarray(2, 2 + headerLength))
  if (!header.includes('Path:audio')) return null
  return data.subarray(2 + headerLength)
}

async function toBytes(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  return null
}

async function openSynthesisSocket(skewSeconds: number): Promise<WorkerSocket> {
  const connectionId = hexUuid()
  const url = new URL(SYNTHESIS_URL)
  url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN)
  url.searchParams.set('Sec-MS-GEC', await secMsGec(skewSeconds))
  url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION)
  url.searchParams.set('ConnectionId', connectionId)

  const response = (await fetch(url.toString(), {
    headers: {
      Upgrade: 'websocket',
      Origin: EDGE_ORIGIN,
      'User-Agent': EDGE_UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  })) as UpgradeResponse

  const socket = response.webSocket
  if (!socket || response.status !== 101) {
    throw new Error(`WebSocket upgrade failed (${response.status})`)
  }
  return socket
}

async function synthesize(text: string, voice: string): Promise<Uint8Array> {
  let lastError: Error | null = null
  for (const skew of [0, -300, 300]) {
    try {
      const socket = await openSynthesisSocket(skew)
      return await collectAudio(socket, text, voice)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error('TTS synthesis failed')
}

function collectAudio(socket: WorkerSocket, text: string, voice: string): Promise<Uint8Array> {
  const requestId = hexUuid()
  const chunks: Uint8Array[] = []

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error('TTS timed out')), SYNTH_TIMEOUT_MS)

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // already closed
      }
      if (error) {
        reject(error)
        return
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0)
      if (total === 0) {
        reject(new Error('no audio received'))
        return
      }
      const out = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.byteLength
      }
      resolve(out)
    }

    socket.addEventListener('message', (event: MessageEvent) => {
      if (settled) return
      const data = event.data
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) finish()
        return
      }
      void toBytes(data)
        .then((bytes) => {
          if (!bytes || settled) return
          const audio = parseBinaryAudio(bytes)
          if (audio && audio.byteLength > 0) chunks.push(audio)
        })
        .catch((err) => finish(err instanceof Error ? err : new Error(String(err))))
    })
    socket.addEventListener('error', () => finish(new Error('WebSocket error')))
    socket.addEventListener('close', () => {
      if (!settled) finish(chunks.length ? undefined : new Error('socket closed before audio'))
    })

    socket.accept()
    socket.send(speechConfigMessage())
    socket.send(ssmlMessage(requestId, voice, text))
  })
}

async function handleTts(request: Request): Promise<Response> {
  const contentType = request.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(request, { error: 'content-type must be application/json' }, 400)
  }

  let body: { text?: unknown; voice?: unknown }
  try {
    body = (await request.json()) as { text?: unknown; voice?: unknown }
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.text !== 'string') {
    return jsonResponse(request, { error: 'Missing text' }, 400)
  }
  if (body.voice !== undefined && typeof body.voice !== 'string') {
    return jsonResponse(request, { error: 'voice must be a string' }, 400)
  }

  const voice =
    typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : DEFAULT_VOICE
  const prepared = prepareText(body.text)
  if (!prepared.text) {
    return jsonResponse(request, { error: 'Missing text' }, 400)
  }

  try {
    const audio = await synthesize(prepared.text, voice)
    const headers = new Headers(corsHeaders(request))
    headers.set('Content-Type', 'audio/mpeg')
    headers.set('X-TTS-Voice', voice)
    headers.set('Cache-Control', 'no-store')
    if (prepared.truncated) headers.set('X-TTS-Truncated', '1')
    return new Response(audio, { status: 200, headers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed'
    return jsonResponse(request, { error: message }, 502)
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    const { pathname } = new URL(request.url)

    if (pathname === '/health' && request.method === 'GET') {
      return jsonResponse(request, { ok: true, voice: DEFAULT_VOICE })
    }

    if (pathname === '/tts') {
      if (request.method !== 'POST') {
        return jsonResponse(request, { error: 'method not allowed' }, 405)
      }
      return handleTts(request)
    }

    return jsonResponse(request, { error: 'route not found' }, 404)
  },
}

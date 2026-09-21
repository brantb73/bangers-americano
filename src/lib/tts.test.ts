import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTtsRequestBody,
  fetchTtsAudio,
  isLocalTtsEndpoint,
  prepareTtsText,
  resolveTtsEndpoint,
  TTS_MAX_CHARS,
  TTS_VOICE,
  unreachableTtsMessage,
} from './tts'

describe('prepareTtsText', () => {
  it('returns empty for blank input', () => {
    expect(prepareTtsText('   ')).toEqual({ text: '', truncated: false })
  })

  it('passes through short scripts', () => {
    const s = 'Welcome back to the Bangers Highlight Reel.'
    expect(prepareTtsText(s)).toEqual({ text: s, truncated: false })
  })

  it('truncates long scripts with a note', () => {
    const huge = 'x'.repeat(TTS_MAX_CHARS + 200)
    const { text, truncated } = prepareTtsText(huge)
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(TTS_MAX_CHARS)
    expect(text).toContain('[Recap truncated for audio length.]')
  })
})

describe('resolveTtsEndpoint', () => {
  it('falls back to same-origin /api/tts when unset or blank', () => {
    expect(resolveTtsEndpoint(undefined)).toBe('/api/tts')
    expect(resolveTtsEndpoint('')).toBe('/api/tts')
    expect(resolveTtsEndpoint('   ')).toBe('/api/tts')
  })

  it('appends /tts to a Worker origin', () => {
    expect(resolveTtsEndpoint('https://bangers-americano-tts.example.workers.dev')).toBe(
      'https://bangers-americano-tts.example.workers.dev/tts',
    )
  })

  it('strips trailing slashes on the origin', () => {
    expect(resolveTtsEndpoint('https://bangers-tts.workers.dev/')).toBe(
      'https://bangers-tts.workers.dev/tts',
    )
  })

  it('keeps a URL that already ends with /tts', () => {
    expect(resolveTtsEndpoint('https://bangers-tts.workers.dev/tts')).toBe(
      'https://bangers-tts.workers.dev/tts',
    )
    expect(resolveTtsEndpoint('https://bangers-tts.workers.dev/tts/')).toBe(
      'https://bangers-tts.workers.dev/tts',
    )
  })
})

describe('buildTtsRequestBody', () => {
  it('sends text plus the default Andrew voice', () => {
    expect(buildTtsRequestBody('Game to 11.')).toEqual({
      text: 'Game to 11.',
      voice: 'en-US-AndrewNeural',
    })
    expect(TTS_VOICE).toBe('en-US-AndrewNeural')
  })

  it('allows an explicit voice override', () => {
    expect(buildTtsRequestBody('Hello', 'en-US-AriaNeural')).toEqual({
      text: 'Hello',
      voice: 'en-US-AriaNeural',
    })
  })
})

describe('unreachableTtsMessage', () => {
  it('treats relative and /api/tts paths as local', () => {
    expect(isLocalTtsEndpoint('/api/tts')).toBe(true)
    expect(isLocalTtsEndpoint('https://localhost:5173/api/tts')).toBe(true)
    expect(isLocalTtsEndpoint('https://bangers-tts.workers.dev/tts')).toBe(false)
  })

  it('uses the Vite-server hint for local endpoints', () => {
    expect(unreachableTtsMessage('/api/tts')).toMatch(/npm run dev/)
  })

  it('uses a courtside CORS hint for the hosted worker', () => {
    const msg = unreachableTtsMessage('https://bangers-tts.workers.dev/tts')
    expect(msg).toMatch(/Courtside audio is blocked/)
    expect(msg).toMatch(/CORS/)
    expect(msg).toMatch(/brantb73\.github\.io/)
    expect(msg).toMatch(/bangerstournify\.com/)
  })
})

describe('fetchTtsAudio', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs JSON { text, voice } to the resolved endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Blob(['ID3'], { type: 'audio/mpeg' }), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-TTS-Voice': TTS_VOICE,
        },
      }),
    )

    const result = await fetchTtsAudio('  Courtside snark.  ', {
      endpoint: 'https://bangers-tts.workers.dev/tts',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://bangers-tts.workers.dev/tts')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Courtside snark.',
      voice: 'en-US-AndrewNeural',
    })
    expect(result.voice).toBe(TTS_VOICE)
    expect(result.truncated).toBe(false)
    expect(result.blob.type).toBe('audio/mpeg')
  })

  it('throws a courtside CORS message when the remote worker is blocked', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      fetchTtsAudio('Medal ceremony time.', {
        endpoint: 'https://bangers-tts.workers.dev/tts',
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: 'TtsError',
      message: expect.stringMatching(/Courtside audio is blocked.*CORS/),
    })
  })

  it('throws the local-server hint when same-origin /api/tts is down', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(fetchTtsAudio('Medal ceremony time.', { fetchImpl })).rejects.toMatchObject({
      name: 'TtsError',
      message: expect.stringMatching(/\/api\/tts/),
    })
  })
})

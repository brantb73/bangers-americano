import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const EDGE_TTS = path.join(PROJECT_ROOT, '.venv', 'bin', 'edge-tts')
/** Warm conversational US English — podcast host vibe */
export const TTS_VOICE = 'en-US-AndrewNeural'
export const TTS_MAX_CHARS = 4500

function prepareText(raw: string): { text: string; truncated: boolean } {
  const trimmed = raw.trim()
  if (!trimmed) return { text: '', truncated: false }
  if (trimmed.length <= TTS_MAX_CHARS) return { text: trimmed, truncated: false }
  const note = '\n\n[Recap truncated for audio length.]'
  const slice = trimmed.slice(0, Math.max(0, TTS_MAX_CHARS - note.length))
  return { text: slice + note, truncated: true }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function runEdgeTts(text: string, outFile: string, voice = TTS_VOICE): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!existsSync(EDGE_TTS)) {
      reject(
        new Error(
          'edge-tts not found. From the project root run: python3 -m venv .venv && .venv/bin/pip install edge-tts',
        ),
      )
      return
    }
    const child = spawn(
      EDGE_TTS,
      ['--voice', voice, '--text', text, '--write-media', outFile],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `edge-tts exited with code ${code}`))
    })
  })
}

async function handleTts(
  req: IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    next()
    return
  }

  try {
    const raw = await readBody(req)
    let body: { text?: string; voice?: string }
    try {
      body = JSON.parse(raw.toString('utf8')) as { text?: string; voice?: string }
    } catch {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }

    const prepared = prepareText(typeof body.text === 'string' ? body.text : '')
    if (!prepared.text) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing text' }))
      return
    }

    const voice =
      typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : TTS_VOICE

    const id = randomBytes(8).toString('hex')
    const outFile = path.join(tmpdir(), `bangers-tts-${id}.mp3`)
    try {
      await runEdgeTts(prepared.text, outFile, voice)
      const stat = await fs.stat(outFile)
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Content-Length', String(stat.size))
      res.setHeader('X-TTS-Voice', voice)
      if (prepared.truncated) res.setHeader('X-TTS-Truncated', '1')
      res.setHeader('Cache-Control', 'no-store')
      createReadStream(outFile)
        .on('close', () => {
          void fs.unlink(outFile).catch(() => {})
        })
        .pipe(res)
    } catch (err) {
      await fs.unlink(outFile).catch(() => {})
      throw err
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed'
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: message }))
  }
}

/** Vite plugin: POST /api/tts → mp3 via edge-tts (dev + preview). */
export function ttsApiPlugin(): Plugin {
  return {
    name: 'bangers-tts-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', handleTts)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tts', handleTts)
    },
  }
}

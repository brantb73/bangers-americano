import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { isIosApp } from './platform'
import { SpeechFile } from './speechFile'
import { isShareCancel } from './nativeShare'
import { fetchTtsAudio, shareAudioFile, TtsError, type ShareAudioResult } from './tts'

export type RecapAudioKind = 'native-file' | 'server-mp3'

export interface GeneratedRecapAudio {
  kind: RecapAudioKind
  /** URL the in-app `<audio>` element can play. */
  playbackUrl: string
  /** `file://` URI for the iOS share sheet. */
  shareUri: string | null
  blob: Blob | null
  filename: string
  truncated: boolean
  voice: string | null
  mimeType: string
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatVoice(name: string, quality: string): string {
  if (!name) return quality
  if (!quality || quality === 'default') return name
  return `${name} (${quality})`
}

/**
 * iPhone: Apple's speech synthesizer writes a file on the device.
 * Website / dev: existing `POST /api/tts` MP3 path.
 */
export async function generateRecapAudio(script: string): Promise<GeneratedRecapAudio> {
  if (isIosApp()) {
    const text = script.trim()
    if (!text) throw new TtsError('Nothing to narrate', 400)
    try {
      const result = await SpeechFile.synthesize({ text })
      const ext = result.mimeType.includes('wav') ? 'wav' : 'm4a'
      return {
        kind: 'native-file',
        playbackUrl: Capacitor.convertFileSrc(result.uri),
        shareUri: result.uri,
        blob: null,
        filename: `tournify-highlight-reel-${dateStamp()}.${ext}`,
        truncated: result.truncated,
        voice: formatVoice(result.voice, result.quality),
        mimeType: result.mimeType,
      }
    } catch (err) {
      if (err instanceof TtsError) throw err
      const message = errorMessage(err) || 'Could not create the audio recap on this iPhone'
      throw new TtsError(message, 500)
    }
  }

  const server = await fetchTtsAudio(script)
  return {
    kind: 'server-mp3',
    playbackUrl: URL.createObjectURL(server.blob),
    shareUri: null,
    blob: server.blob,
    filename: `bangers-highlight-reel-${dateStamp()}.mp3`,
    truncated: server.truncated,
    voice: server.voice,
    mimeType: server.blob.type || 'audio/mpeg',
  }
}

export async function shareGeneratedRecap(
  audio: GeneratedRecapAudio,
): Promise<ShareAudioResult> {
  if (audio.kind === 'native-file') {
    if (!audio.shareUri) return 'failed'
    try {
      await Share.share({
        title: 'Tournify highlight reel',
        files: [audio.shareUri],
        dialogTitle: 'Share audio recap',
      })
      return 'shared'
    } catch (err) {
      return isShareCancel(err) ? 'cancelled' : 'failed'
    }
  }
  if (!audio.blob) return 'failed'
  return shareAudioFile(audio.blob, audio.filename, 'Bangers Highlight Reel')
}

export function releaseRecapAudio(audio: GeneratedRecapAudio | null): void {
  if (audio?.playbackUrl.startsWith('blob:')) {
    URL.revokeObjectURL(audio.playbackUrl)
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return ''
}

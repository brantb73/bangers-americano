import { registerPlugin, WebPlugin } from '@capacitor/core'

export interface SpeechFileResult {
  /** `file://` URL of the generated recap. */
  uri: string
  voice: string
  /** `premium`, `enhanced`, or `default`. */
  quality: string
  truncated: boolean
  /** `audio/mp4` for .m4a, or `audio/wav` if AAC export was unavailable. */
  mimeType: string
}

export interface SpeechFilePlugin {
  synthesize(options: { text: string }): Promise<SpeechFileResult>
}

class SpeechFileWeb extends WebPlugin implements SpeechFilePlugin {
  async synthesize(): Promise<SpeechFileResult> {
    throw new Error('On-device audio recap is only available in the iPhone app')
  }
}

export const SpeechFile = registerPlugin<SpeechFilePlugin>('SpeechFile', {
  web: () => Promise.resolve(new SpeechFileWeb()),
})

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker origin or full `/tts` URL for hosted MP3 recaps. */
  readonly VITE_TTS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

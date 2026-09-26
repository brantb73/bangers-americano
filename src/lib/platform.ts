import { Capacitor } from '@capacitor/core'

/** True only inside the Capacitor iPhone app. The website and `npm run dev` stay `web`. */
export function isIosApp(): boolean {
  try {
    return Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

export type RecapSurface = 'ios' | 'web'

/**
 * Single platform check for the recap panel.
 * iOS creates an on-device audio file. The website keeps Web Speech preview
 * and the local `/api/tts` MP3 path.
 */
export function recapSurface(ios = isIosApp()): RecapSurface {
  return ios ? 'ios' : 'web'
}

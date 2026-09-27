import { KeepAwake } from '@capacitor-community/keep-awake'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isIosApp } from './platform'

/** Status bar and splash. Safe-area padding is CSS, so the web view can sit under the notch. */
export async function initNativeShell(): Promise<void> {
  if (!isIosApp()) return
  try {
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    // Status bar styling is cosmetic. Scoring still works if it fails.
  }
  try {
    await SplashScreen.hide()
  } catch {
    // Auto-hide may already have dismissed the splash.
  }
}

/** Keep the screen on while a session is in progress. Optional; failures are ignored. */
export async function setKeepAwake(on: boolean): Promise<void> {
  if (!isIosApp()) return
  try {
    if (on) await KeepAwake.keepAwake()
    else await KeepAwake.allowSleep()
  } catch {
    // Leave the system idle timer alone.
  }
}

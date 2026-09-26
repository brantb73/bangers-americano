import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iPhone app identity.
 *
 * Bundle id lives here. After you change `appId`, run `npm run ios:sync`
 * so Xcode picks up the new PRODUCT_BUNDLE_IDENTIFIER.
 *
 * Do not set `server.url`. The app loads the files `npm run ios:sync`
 * copies into the Xcode project, so it works with no network.
 */
const config: CapacitorConfig = {
  appId: 'com.brantb73.tournify',
  appName: 'Tournify',
  webDir: 'dist',
  backgroundColor: '#05070a',
  ios: {
    backgroundColor: '#05070a',
    // Edge-to-edge web view. Safe areas are padded in CSS (`env(safe-area-inset-*)`).
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: '#05070a',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#05070a',
    },
  },
}

export default config

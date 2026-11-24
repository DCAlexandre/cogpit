import type { CapacitorConfig } from '@capacitor/cli'

// Native build (from the mobile/ folder, or via root `pnpm android` / `pnpm apk`):
//   pnpm --filter cogpit-mobile build:web
//   npx cap add android        # once (also: npx cap add ios on macOS)
//   pnpm android               # build web + sync + run on device/emulator
//   pnpm build                 # build web + sync + produce an APK
// In-app QR scanning uses @capacitor-mlkit/barcode-scanning on native; the
// bridge-served web build reads pairing from the URL #fragment instead.
const config: CapacitorConfig = {
  appId: 'dev.cogpit.companion',
  appName: 'Cogpit',
  webDir: 'dist',
  // The bridge speaks plain ws:// on the LAN (the payload is E2E-encrypted by
  // Noise). Android blocks cleartext by default, so allow it here. Live reload
  // (`ionic cap run … -l --external`) also serves the dev app over http.
  server: {
    cleartext: true,
    androidScheme: 'http'
  }
}

export default config

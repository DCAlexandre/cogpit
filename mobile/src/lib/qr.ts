/** Native QR scanning via @capacitor-mlkit/barcode-scanning. On the web (bridge-
 *  served) build this is unused — pairing comes from the URL fragment. The plugin
 *  is dynamically imported so the web bundle never needs its native code.
 *
 *  Throws an Error with a short code the UI maps to a message:
 *    'camera-denied' | 'module-installing' | 'scan-failed'
 *  Resolves to the scanned string, or null if nothing was scanned. */
import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function scanQr(): Promise<string | null> {
  const mod = await import('@capacitor-mlkit/barcode-scanning')
  const { BarcodeScanner, BarcodeFormat } = mod

  const perm = await BarcodeScanner.requestPermissions()
  if (perm.camera !== 'granted' && perm.camera !== 'limited') {
    throw new Error('camera-denied')
  }

  // On Android the Google code-scanner module may need a one-time install.
  if (Capacitor.getPlatform() === 'android') {
    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule()
        // The module downloads in the background; ask the user to retry shortly.
        throw new Error('module-installing')
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'module-installing') throw e
      // isGoogleBarcodeScannerModuleAvailable unsupported on some versions → proceed
    }
  }

  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] })
    return barcodes[0]?.rawValue ?? null
  } catch (e) {
    console.error('QR scan failed', e)
    throw new Error('scan-failed')
  }
}

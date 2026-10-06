import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// The renderer's CSP (in index.html) allows the Vite HMR websocket + localhost
// for development. The packaged app makes no network calls, so strip those
// dev-only grants from connect-src when building for production — leaving a
// strict `connect-src 'self'`. Done in the HTML (not an HTTP header) because a
// packaged app loads the renderer over file://, which headers don't cover.
function cspHardening(): Plugin {
  return {
    name: 'cogpit-csp-hardening',
    transformIndexHtml(html, ctx): string {
      if (ctx.server) return html // dev server: keep ws:/localhost for HMR
      return html.replace("connect-src 'self' ws: wss: http://localhost:*", "connect-src 'self'")
    }
  }
}

export default defineConfig({
  main: {
    // the pty backend is an optional native dep; force it external so it is
    // required at runtime (and fails gracefully when absent) rather than bundled.
    plugins: [externalizeDepsPlugin({ include: ['@homebridge/node-pty-prebuilt-multiarch'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react(), cspHardening()]
  }
})

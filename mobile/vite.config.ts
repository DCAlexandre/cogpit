import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' so the built assets load no matter what path the bridge serves them
// from. The bridge serves dist/ and the pairing URL carries a #fragment.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5180 },
  build: { outDir: 'dist', emptyOutDir: true }
})

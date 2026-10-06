import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './assets/fonts/fonts.css'
import './index.css'
import App from './App'

// Forward uncaught renderer errors to the main-process log file (dev).
window.addEventListener('error', (e) =>
  window.api.log('error', 'window', e.message, { source: e.filename, line: e.lineno })
)
window.addEventListener('unhandledrejection', (e) =>
  window.api.log('error', 'window', 'unhandledrejection', String(e.reason))
)
window.api.log('info', 'renderer', 'boot')

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

/** Last-resort guard: a render crash shows a readable message instead of a blank
 *  (black) screen, and lets the user reload. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            color: 'hsl(40 20% 96%)',
            background: 'hsl(30 9% 11%)',
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace'
          }}
        >
          <div style={{ color: 'hsl(41 100% 53%)', fontWeight: 600 }}>Erreur</div>
          <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 320, wordBreak: 'break-word' }}>
            {String(this.state.error?.message ?? this.state.error)}
          </div>
          <button
            onClick={() => location.reload()}
            style={{
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              background: 'hsl(41 100% 53%)',
              color: 'hsl(34 45% 8%)',
              border: 'none'
            }}
          >
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

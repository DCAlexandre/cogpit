/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        /* amber / brass accents */
        brass: 'hsl(var(--brass))',
        copper: 'hsl(var(--copper))',
        patina: 'hsl(var(--patina))',
        /* teal — running sessions */
        live: 'hsl(var(--live))'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)'
      },
      fontFamily: {
        display: ['var(--font-display, Oxanium)', '"JetBrains Mono"', 'monospace'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        glow: '0 0 18px -4px hsl(var(--primary) / 0.55)',
        'glow-sm': '0 0 10px -3px hsl(var(--primary) / 0.5)',
        inset: 'inset 0 1px 0 0 hsl(var(--primary) / 0.12), inset 0 -2px 6px 0 rgb(0 0 0 / 0.5)'
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'panel-in': 'panel-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'led-pulse': 'led-pulse 2s ease-in-out infinite',
        flicker: 'flicker 5s steps(1) infinite'
      }
    }
  },
  plugins: []
}

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design tokens — 星空配色
        background:    'var(--color-bg)',
        surface:       'var(--color-surface)',
        'surface-2':   'var(--color-surface-2)',
        border:        'var(--color-border)',
        primary:       'var(--color-primary)',
        'primary-dim': 'var(--color-primary-dim)',
        up:            'var(--color-up)',
        'up-dim':      'var(--color-up-dim)',
        down:          'var(--color-down)',
        'down-dim':    'var(--color-down-dim)',
        muted:         'var(--color-muted)',
        foreground:    'var(--color-fg)',
        'fg-dim':      'var(--color-fg-dim)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        card: '1rem',
        pill: '9999px',
      },
      boxShadow: {
        glow:    '0 0 20px var(--color-primary-dim)',
        'glow-up':   '0 0 16px var(--color-up-dim)',
        'glow-down': '0 0 16px var(--color-down-dim)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.2' },
          '50%':      { opacity: '1' },
        },
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      animation: {
        float:      'float 4s ease-in-out infinite',
        twinkle:    'twinkle 3s ease-in-out infinite',
        ticker:     'ticker 30s linear infinite',
        'slide-up': 'slide-up 0.3s ease forwards',
        'fade-in':  'fade-in 0.2s ease forwards',
        pulse:      'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config

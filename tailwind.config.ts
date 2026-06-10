import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        midnight:  '#0D1B2A',
        deep:      '#1B2D40',
        cyan: {
          DEFAULT: '#00B4D8',
          light:   '#E0F7FC',
          dark:    '#0097B2',
        },
        amber: {
          brand:   '#F4A62A',
          dark:    '#D4881A',
        },
        'page-bg': '#F0F4F8',
        surface:   '#FFFFFF',
        'card-border': '#E1E8F0',
        'text-primary':   '#0D1B2A',
        'text-secondary': '#4A5568',
        'text-muted':     '#94A3B8',
        success: {
          DEFAULT: '#10B981',
          light:   '#D1FAE5',
          dark:    '#059669',
        },
        warn: {
          DEFAULT: '#F59E0B',
          light:   '#FEF3C7',
        },
        danger: {
          DEFAULT: '#EF4444',
          light:   '#FEE2E2',
        },
      },
      boxShadow: {
        card:    '0 1px 3px rgba(13,27,42,0.06), 0 1px 2px rgba(13,27,42,0.04)',
        amber:   '0 4px 16px rgba(244,166,42,0.45)',
        cyan:    '0 4px 14px rgba(0,180,216,0.3)',
        nav:     '0 -1px 12px rgba(13,27,42,0.15)',
        'amber-sm': '0 4px 12px rgba(244,166,42,0.3)',
      },
    },
  },
  plugins: [],
}

export default config

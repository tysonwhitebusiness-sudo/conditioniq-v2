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
        cyan: {
          DEFAULT: '#00B4D8',
          light:   '#E0F7FC',
          dark:    '#0097B2',
          tint:    'rgba(0,180,216,0.08)',
        },
        amber: {
          brand:   '#F4A62A',
          dark:    '#D4881A',
        },
        gray: {
          900: '#111827',
          700: '#374151',
          500: '#6B7280',
          300: '#D1D5DB',
          100: '#F3F4F6',
        },
        'page-bg': '#FFFFFF',
        surface:   '#FFFFFF',
        'card-border': '#D1D5DB',
        'text-primary':   '#111827',
        'text-secondary': '#374151',
        'text-muted':     '#6B7280',
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
        card:    '0 1px 3px rgba(17,24,39,0.06), 0 1px 2px rgba(17,24,39,0.04)',
        amber:   '0 4px 16px rgba(244,166,42,0.45)',
        cyan:    '0 4px 14px rgba(0,180,216,0.3)',
        nav:     '0 -1px 12px rgba(17,24,39,0.08)',
        'amber-sm': '0 4px 12px rgba(244,166,42,0.3)',
      },
    },
  },
  plugins: [],
}

export default config

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1e3a5f',
          50: '#e8eef6',
          100: '#c5d4e8',
          200: '#9fb8d8',
          300: '#789cc8',
          400: '#5a87bc',
          500: '#3c72b0',
          600: '#2d5a94',
          700: '#1e3a5f',
          800: '#162d4a',
          900: '#0e1f34',
        },
        brand: {
          orange: '#dc5010',
          navy: '#1e3a5f',
        },
      },
    },
  },
  plugins: [],
}

export default config

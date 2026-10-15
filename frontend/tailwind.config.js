/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        pearl: {
          50: '#fbfbf9',
          100: '#f5f5f0',
          200: '#ebebe4',
          300: '#deded5',
        },
        silver: {
          50: '#f7f7f6',
          100: '#f0f0ee',
          200: '#e5e5e0',
          300: '#d4d4d0',
          400: '#a3a39e',
          500: '#73736c',
          600: '#52524e',
        },
        brand: {
          black: '#111111',
          charcoal: '#1a1a1a',
          muted: '#262626',
        }
      },
      boxShadow: {
        'figma-btn': '0 1px 2px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'figma-btn-secondary': '0 1px 2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        'figma-card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.06)',
        'figma-card-hover': '0 6px 16px -2px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08)',
        'figma-modal': '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [],
}

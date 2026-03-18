/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#0b1020',
          panel: '#131a2a',
          panelAlt: '#1a2235',
          border: '#283246',
          muted: '#93a1b7',
          text: '#e5ecf5',
          accent: '#5ea0ff',
          success: '#4ade80',
          warn: '#facc15',
          danger: '#f87171'
        }
      },
      boxShadow: {
        panel: '0 6px 18px rgba(0, 0, 0, 0.28)'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Consolas', 'ui-monospace', 'monospace']
      }
    },
  },
  plugins: [],
};

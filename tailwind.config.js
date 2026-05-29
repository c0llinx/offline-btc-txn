/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        btc: {
          primary: '#F7931A',
          primaryDark: '#E8850F',
          background: '#0D1117',
          surface: '#161B22',
          surfaceLight: '#21262D',
          border: '#30363D',
          text: '#F0F6FC',
          secondary: '#8B949E',
          muted: '#484F58',
          success: '#3FB950',
          warning: '#D29922',
          error: '#F85149',
          info: '#58A6FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

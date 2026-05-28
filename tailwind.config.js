export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#121212',
          900: '#19191b',
          850: '#202024',
          800: '#2d2d31',
          700: '#4b4b52',
          500: '#7f7f88',
          300: '#c6c4cf',
          100: '#f7f6f0',
        },
        accent: {
          500: '#111111',
          400: '#303033',
          300: '#d8ff54',
        },
      },
      boxShadow: {
        glow: '0 18px 52px #c9c6bd',
      },
    },
  },
  plugins: [],
};

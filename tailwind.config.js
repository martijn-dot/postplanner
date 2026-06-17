export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#100e1d',
          900: '#171325',
          850: '#1d182e',
          800: '#252038',
          700: '#39324e',
          500: '#7d7790',
          300: '#c3bdd6',
          100: '#f3f0ff',
        },
        accent: {
          500: '#6d5dfc',
          400: '#8374ff',
          300: '#a69cff',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(109, 93, 252, 0.28), 0 24px 70px rgba(8, 6, 20, 0.42)',
      },
    },
  },
  plugins: [],
};

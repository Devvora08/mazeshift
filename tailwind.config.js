/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#f0f0f0',
          dark: '#dcdcdc',
        },
        ink: {
          DEFAULT: '#111111',
          soft: '#404040',
        },
        hero: '#c026d3',
        spell: {
          phase: '#22d3ee',
          destroy: '#f97316',
          scramble: '#a3e635',
          dash: '#facc15',
          shield: '#38bdf8',
          trap: '#ef4444',
        },
        danger: '#dc2626',
      },
      fontFamily: {
        hand: ['ArchitectsDaughter'],
        script: ['PatrickHand'],
      },
    },
  },
  plugins: [],
};

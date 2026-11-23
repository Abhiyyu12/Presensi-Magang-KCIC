/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Palet brand KCIC (#8B1A1A); varian soft/border dipakai state hover & aksen.
        brand: {
          50: '#fbf0f0',
          100: '#f6dbdb',
          200: '#ecbdbd',
          300: '#da8c8c',
          400: '#c75f5f',
          500: '#b23a3a',
          600: '#9e2626',
          700: '#8b1a1a',
          800: '#6e1414',
          900: '#571010',
          950: '#3f0c0c',
        },
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

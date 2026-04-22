/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#1e1f22',
        'panel-2': '#2b2d31',
        'panel-3': '#383a40',
        accent: '#5865f2',
      },
    },
  },
  plugins: [],
};

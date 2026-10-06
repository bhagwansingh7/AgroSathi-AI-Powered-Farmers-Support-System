/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { leaf: { 50: '#f1f8ec', 100: '#e0f0d3', 200: '#c3e1ab', 300: '#9ccb7a', 400: '#76b351', 500: '#559936', 600: '#417a28', 700: '#336023', 800: '#2c4c20', 900: '#263f1d' }, soil: { 50: '#faf6f1', 100: '#f1e8db', 500: '#8a6a42', 700: '#5e4529' } },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

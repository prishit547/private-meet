/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        meet: {
          bg: '#1f1f1f',
          surface: '#2d2e30',
          hover: '#3c4043',
          border: '#434548',
          accent: '#8ab4f8',
          danger: '#ea4335',
          green: '#34a853',
          yellow: '#fbbc04'
        }
      }
    },
  },
  plugins: [],
}

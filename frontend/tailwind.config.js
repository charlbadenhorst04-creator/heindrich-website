/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        maroon: {
          50: "#fbf2f3",
          100: "#f6e3e5",
          200: "#eec7cc",
          300: "#e0a0a9",
          400: "#cd6f7e",
          500: "#b34a5c",
          600: "#8f2f40",
          700: "#7a2436",
          800: "#611c2b",
          900: "#4a1520",
        },
        blush: {
          50: "#fdf6f3",
          100: "#faeae3",
          200: "#f3d2c4",
        },
        gold: {
          400: "#c9a15a",
          500: "#b8863d",
          600: "#96692b",
        },
      },
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        sans: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};

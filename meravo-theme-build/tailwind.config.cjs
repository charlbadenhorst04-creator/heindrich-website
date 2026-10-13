/**
 * Builds meravo-theme/assets/theme.css from the classes used in the theme.
 *
 * The palette is the storefront's own (frontend/tailwind.config.js), so the
 * Shopify theme and the React site stay one design. Fonts come from the
 * theme editor's font pickers, through CSS variables set in
 * snippets/font-faces.liquid.
 *
 * Rebuild after changing any classes:  bash meravo-theme-build/build.sh
 */
const path = require("path");

const theme = path.join(__dirname, "..", "meravo-theme");

module.exports = {
  content: [
    path.join(theme, "layout/*.liquid"),
    path.join(theme, "sections/*.liquid"),
    path.join(theme, "snippets/*.liquid"),
    path.join(theme, "templates/*.liquid"),
    path.join(theme, "assets/theme.js"),
  ],
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
        display: ["var(--font-heading-family)"],
        sans: ["var(--font-body-family)"],
      },
    },
  },
  plugins: [],
};

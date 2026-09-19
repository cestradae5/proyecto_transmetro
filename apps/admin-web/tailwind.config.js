/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#001251",
        "primary-container": "#0a257a",
        secondary: "#2d6c00",
        "secondary-container": "#a6f875",
        surface: "#f8fafc",
        "on-surface": "#0f172a",
        "on-surface-variant": "#475569",
        outline: "#94a3b8",
        "outline-variant": "#e2e8f0",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

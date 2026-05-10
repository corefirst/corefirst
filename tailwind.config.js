/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cflt: {
          core: "#3b82f6",     // Blue
          reason: "#10b981",   // Green
          space: "#f59e0b",    // Amber
          time: "#6b7280",     // Gray
        }
      }
    },
  },
  plugins: [],
}

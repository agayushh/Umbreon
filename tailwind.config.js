/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./options.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shopify: {
          bg: "#08080a",
          card: "#111115",
          "card-hover": "#18181c",
          border: "#22222a",
          input: "#16161a",
          primary: "#e11d48",
          "primary-hover": "#d91b3b",
          text: "#ffffff",
          muted: "#9a9aa5",
        },
        nexidus: {
          bg: "#e9ecef",
          card: "#ffffff",
          "card-hover": "#f8fafc",
          border: "#dcdfe4",
          input: "#f8fafc",
          primary: "#e0562e",
          navy: "#253549",
          text: "#0f172a",
          muted: "#64748b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}



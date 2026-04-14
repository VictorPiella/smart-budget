/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      colors: {
        // Design system tokens
        surface: {
          0: "#040408",   // page background
          1: "#08080f",   // sidebar
          2: "#0d0d1a",   // card
          3: "#111122",   // elevated card / nested
          4: "#161628",   // input / select
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.06)",
          strong:  "rgba(255,255,255,0.10)",
          subtle:  "rgba(255,255,255,0.03)",
        },
        cyan: {
          DEFAULT: "#22d3ee",
          dim:     "rgba(34,211,238,0.15)",
          glow:    "rgba(34,211,238,0.08)",
        },
      },
      boxShadow: {
        card:    "0 0 0 1px rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.6)",
        "card-hover": "0 0 0 1px rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.7)",
        glow:    "0 0 20px rgba(34,211,238,0.15)",
      },
    },
  },
  plugins: [],
};

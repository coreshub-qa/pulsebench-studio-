/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#090d0e",
          900: "#101719",
          800: "#152023",
          700: "#203034"
        },
        signal: {
          cyan: "#6bf7da",
          copper: "#d68b42",
          ember: "#ff6f3d",
          fog: "#d5dfdb"
        }
      },
      fontFamily: {
        display: ["Fraunces", "Noto Serif SC", "serif"],
        body: ["Noto Sans SC", "PingFang SC", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"]
      },
      boxShadow: {
        panel: "0 20px 50px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(107,247,218,0.12), 0 0 30px rgba(107,247,218,0.08)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(107,247,218,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(107,247,218,0.08) 1px, transparent 1px)"
      }
    },
  },
  plugins: [],
};

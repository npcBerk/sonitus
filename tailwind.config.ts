import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(148, 163, 184, 0.08), 0 24px 80px rgba(2, 6, 23, 0.55)"
      },
      colors: {
        ink: {
          950: "#030712"
        }
      }
    }
  },
  plugins: []
};

export default config;

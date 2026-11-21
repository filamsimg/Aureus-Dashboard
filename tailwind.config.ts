import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#090d16",
        darkCard: "#111827",
        darkBorder: "#1f2937",
        accentBlue: "#3b82f6",
        accentCyan: "#06b6d4",
        neonGreen: "#10b981",
        neonRed: "#ef4444",
        neonAmber: "#f59e0b",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

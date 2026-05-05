/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-primary": "rgb(255, 69, 51)",
        "neutral-background": "rgb(10, 10, 10)",
        "neutral-surface": "rgb(13, 13, 13)",
        "neutral-surface-alt": "rgb(17, 17, 17)",
        "text-primary": "rgb(255, 255, 255)",
        "text-secondary": "rgba(255, 255, 255, 0.56)",
        "border-primary": "rgba(255, 255, 255, 0.1)"
      },
      fontFamily: {
        primary: ["Syne", "sans-serif"],
        secondary: ["Outfit", "sans-serif"]
      },
      keyframes: {
        spin: {
          from: { transform: "translate(-50%, -50%) rotate(0deg)" },
          to: { transform: "translate(-50%, -50%) rotate(360deg)" }
        },
        "marquee-scroll": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" }
        }
      },
      animation: {
        "spin-slow": "spin 10s linear infinite",
        "spin-reverse": "spin 12s linear infinite reverse",
        "text-marquee": "marquee-scroll 25s linear infinite"
      }
    }
  },
  plugins: []
};

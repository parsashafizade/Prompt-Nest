import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,ts,tsx}", "!./src/**/*.test.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        violetstone: {
          50: "#f6f5fa",
          100: "#eeebf4",
          400: "#968baa",
          500: "#7f7395",
          600: "#695e7d",
          900: "#282431"
        }
      },
      boxShadow: {
        "neo-light": "6px 6px 14px #d8d4df, -6px -6px 14px #ffffff",
        "neo-light-inset": "inset 3px 3px 7px #d8d4df, inset -3px -3px 7px #ffffff",
        "neo-dark": "6px 6px 14px #17141d, -6px -6px 14px #393342",
        "neo-dark-inset": "inset 3px 3px 7px #17141d, inset -3px -3px 7px #393342"
      }
    }
  },
  plugins: []
} satisfies Config;

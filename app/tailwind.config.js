/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ARTeam PrintFlow — paper & ink tokens (mirror of index.css custom properties)
        paper: {
          50: "#FBFAF6",
          100: "#F4F1EA",
          200: "#EAE6DA",
        },
        ink: {
          900: "#15171E",
          700: "#343947",
          500: "#6B7280",
          400: "#6B7280",
        },
        sidebar: {
          DEFAULT: "#0E1220",
          900: "#0E1220",
          800: "#161B2E",
          foreground: "#FFFFFF",
          primary: "#0284C7",
          "primary-foreground": "#FFFFFF",
          accent: "#161B2E",
          "accent-foreground": "#FFFFFF",
          border: "rgba(255,255,255,0.07)",
          ring: "#0EA5E9",
        },
        cyan: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          500: "#0EA5E9",
          600: "#0284C7",
        },
        magenta: {
          600: "#DB2777",
        },
        yellow: {
          500: "#EAB308",
        },
        success: {
          600: "#16A34A",
        },
        warning: {
          600: "#D97706",
        },
        danger: {
          600: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["Cairo", "ui-sans-serif", "system-ui", "sans-serif"],
        latin: ["'Space Grotesk'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 1px 2px rgba(21,23,30,.05), 0 10px 28px -14px rgba(21,23,30,.14)",
        pop: "0 24px 64px -20px rgba(21,23,30,.30)",
        focus: "0 0 0 3px rgba(2,132,199,.22)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

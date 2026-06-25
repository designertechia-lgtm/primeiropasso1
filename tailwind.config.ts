import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    fontFamily: {
      sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      serif: ['Lora', 'Georgia', 'serif'],
      // Títulos da landing: respeitam a escolha do profissional (--font-heading, via buildLandingVars).
      // Fora da landing, --font-heading cai no padrão da plataforma (Plus Jakarta Sans, ver index.css).
      heading: ['var(--font-heading)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      // Landing institucional (redesign 2026): Playfair Display nos títulos, Inter no corpo.
      display: ['Playfair Display', 'Lora', 'Georgia', 'serif'],
      inter: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
    },
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
      extend: {
        colors: {
          // Paleta da landing institucional (redesign 2026) — terrosa/sálvia.
          // Aditiva e ISOLADA: não altera os tokens semânticos (teal) do resto do app.
          pp: {
            bg: "#F2F2F2",
            card: "#F8F4EF",
            // Seções intercaladas: cinzas neutros que acompanham o bg novo (#F2F2F2),
            // mantendo ritmo entre seções. Cards seguem no creme (card/cream) por opção.
            surface: "#EAEAEA",
            surface2: "#E5E5E5",
            ink: "#352617",
            "ink-soft": "#403528",
            muted: "#6e6155",
            muted2: "#857369",
            sage: "#87A96B",
            "sage-light": "#a8c98a",
            accent: "#587E45",
            sand: "#C4A882",
            border: "#DDD1C2",
            forest: "#1c2a1e",
            "forest-deep": "#16211a",
            danger: "#DC2A2A",
            cream: "#FBF8F4",
            "wa-header": "#1f8a5b",
            "wa-bubble": "#D7EED9",
            "wa-bg": "#ECE5DB",
          },
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
          secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
          destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
          muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
          accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
          popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
          card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
          sidebar: {
            DEFAULT: "hsl(var(--sidebar-background))",
            foreground: "hsl(var(--sidebar-foreground))",
            primary: "hsl(var(--sidebar-primary))",
            "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
            accent: "hsl(var(--sidebar-accent))",
            "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
            border: "hsl(var(--sidebar-border))",
            ring: "hsl(var(--sidebar-ring))",
          },
        },
        borderRadius: {
          lg: "var(--radius)",
          md: "calc(var(--radius) - 2px)",
          sm: "calc(var(--radius) - 4px)",
          xl: "calc(var(--radius) + 8px)",
          "2xl": "calc(var(--radius) + 16px)",
        },
        keyframes: {
          "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
          "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        },
        animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
      },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
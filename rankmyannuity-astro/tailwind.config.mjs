/** @type {import('tailwindcss').Config} */
// Phase 3 Tailwind config. Mirrors the SPA's color token set verbatim from
// rankmyannuity/src/tailwind.config.js so the ported calculator island
// resolves bg-background, text-foreground, bg-card, border-border, etc.
// to the same HSL values as the live SPA.
//
// Divergence note: the SPA's Tailwind does NOT map --input, --ring, --popover,
// --popover-foreground, or --destructive. The calculator components reference
// those class names; they resolve to undefined values on the live site too.
// T3 parity rule: port byte-for-byte, including the gap.
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted-hsl))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        border: 'hsl(var(--border))',
      },
    },
  },
  plugins: [],
};

/**
 * tailwind.config.js — Tailwind CSS configuration.
 *
 * The content array tells Tailwind which files to scan for class names.
 * Extending the theme adds our custom brand colors (deep navy/slate palette)
 * and the CSS animation used by the loading indicator.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary dark background — deep navy
        'brand-dark': '#0a0f1e',
        // Secondary surface — slightly lighter for cards/bubbles
        'brand-surface': '#111827',
        // Elevated surface — for the input bar and header
        'brand-elevated': '#1a2233',
        // Accent — vibrant blue for user messages and interactive elements
        'brand-accent': '#2563eb',
        // Accent hover state
        'brand-accent-hover': '#1d4ed8',
        // Muted text color
        'brand-muted': '#6b7280',
        // Border color
        'brand-border': '#1f2937',
      },
      animation: {
        // Bounce animation for the three loading dots
        'bounce-dot': 'bounce 1s infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'bounce-dot': 'bounce 1s infinite',
      },
    },
  },
  plugins: [],
}

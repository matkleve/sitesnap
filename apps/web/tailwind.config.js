/**
 * Tailwind CSS configuration — Feldpost Angular app.
 *
 * Design token source of truth. All tokens defined here become the
 * canonical reference for every component; arbitrary values are only
 * permitted when no token covers the use case.
 *
 * Dark mode strategy: ['class', '[data-theme="dark"]']
 *   Tailwind dark: utilities activate when a [data-theme="dark"] attribute
 *   is present on an ancestor element (typically <html>). This mirrors the
 *   existing CSS custom-property toggle already in styles.scss — no changes
 *   to theme-toggle logic are required.
 *
 * Color tokens reference CSS custom properties so Tailwind utilities and
 * component SCSS stay in sync automatically. The CSS custom properties are
 * the single definition point; Tailwind wraps them as named utilities.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // ── Content paths ──────────────────────────────────────────────────────────
  // JIT compiler scans these files to tree-shake unused utilities.
  content: ['./src/**/*.{html,ts,scss}'],

  // ── Dark mode ──────────────────────────────────────────────────────────────
  // ['class', selector] variant: Tailwind generates dark: utilities that
  // activate when the given selector is present on an ancestor.
  // Matches [data-theme="dark"] set by ThemeService (future) or the OS
  // @media fallback already in styles.scss.
  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    // ── Extend (additive) — don't override Tailwind defaults wholesale ───────
    extend: {
      // ── Border radius tokens (semantic names) ─────────────────────────────
      // Primary source of truth for all rounded corners.
      //
      //   pill  — fully rounded pill shape (login buttons, chips, sidebar handles)
      //   card  — rounded rectangle (panels, cards, upload expand)
      //   input — subtle rounding for form inputs and dropdowns
      //
      // Values reference the CSS custom properties from styles.scss so both
      // Tailwind classes (rounded-pill) and SCSS (var(--radius-full)) stay in sync.
      borderRadius: {
        pill: 'var(--radius-full)', // 9999px — pill / capsule shapes
        card: 'var(--radius-lg)', // 16px  — panels, floating cards
        input: 'var(--radius-md)', // 8px   — form inputs, dropdown containers
      },

      // ── Spacing scale ─────────────────────────────────────────────────────
      // Root font size: 16px (browser default, never overridden).
      // Using named aliases that match the --spacing-N CSS custom properties
      // so SCSS var() and Tailwind utilities reference the same scale.
      //
      //   spacing-1 → 0.25rem (4px)
      //   spacing-2 → 0.5rem  (8px)
      //   spacing-3 → 0.75rem (12px)
      //   spacing-4 → 1rem    (16px)
      //   spacing-5 → 1.5rem  (24px)
      //   spacing-6 → 2rem    (32px)
      //   spacing-7 → 3rem    (48px)
      //   spacing-8 → 4rem    (64px)
      //
      // Tailwind's default numeric scale (p-1=4px, p-2=8px, …) is preserved;
      // these named keys are additive aliases for semantic clarity.
      spacing: {
        'spacing-1': '0.25rem',
        'spacing-2': '0.5rem',
        'spacing-3': '0.75rem',
        'spacing-4': '1rem',
        'spacing-5': '1.5rem',
        'spacing-6': '2rem',
        'spacing-7': '3rem',
        'spacing-8': '4rem',
      },

      // ── Color palette ──────────────────────────────────────────────────────
      // All colors reference CSS custom properties defined in styles.scss.
      // This means:
      //   1. A single token definition point (the CSS custom property).
      //   2. Dark-mode variants are automatic — the CSS custom property
      //      already switches when [data-theme="dark"] is applied, so
      //      Tailwind's dark: prefix is only needed when the utility logic
      //      needs to differ structurally (e.g., dark:hidden vs just color switch).
      //
      // Usage examples:
      //   bg-surface          → background: var(--color-bg-surface)
      //   text-text-primary   → color: var(--color-text-primary)
      //   border-border       → border-color: var(--color-border)
      colors: {
        // Backgrounds
        'bg-base': 'var(--color-bg-base)',
        'bg-surface': 'var(--color-bg-surface)',
        'bg-elevated': 'var(--color-bg-elevated)',

        // Borders
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',

        // Text
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-disabled': 'var(--color-text-disabled)',

        // Brand / semantic
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        accent: 'var(--color-accent)',
        clay: 'var(--color-clay)',
      },

      // ── Typography ────────────────────────────────────────────────────────
      // Font sizes use rem. Tailwind's default scale is rem-based and kept
      // intact; these additions cover the specific sizes used in the design.
      fontSize: {
        'label-sm': ['0.625rem', { lineHeight: '1.2' }], // 10px — mobile nav labels
        label: ['0.8125rem', { lineHeight: '1.3' }], // 13px — nav labels, badges
        'body-sm': ['0.875rem', { lineHeight: '1.5' }], // 14px — body text, inputs
        body: ['1rem', { lineHeight: '1.6' }], // 16px — default body
      },

      // ── Font family ───────────────────────────────────────────────────────
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },

      // ── Minimum height for interactive tap targets ─────────────────────────
      // All interactive elements must meet ~38px minimum hit area (design rule).
      // Use min-h-tap or min-h-tap-lg on buttons, chips, icon buttons, etc.
      minHeight: {
        tap: '2.375rem', // 38px — minimum interactive target
        'tap-lg': '2.75rem', // 44px — preferred desktop touch target
      },

      // ── Min width counterpart ─────────────────────────────────────────────
      minWidth: {
        tap: '2.375rem',
        'tap-lg': '2.75rem',
      },

      // ── Box shadows ───────────────────────────────────────────────────────
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },

      // ── Z-index ───────────────────────────────────────────────────────────
      zIndex: {
        map: 'var(--z-map)',
        panel: 'var(--z-panel)',
        'upload-btn': 'var(--z-upload-button)',
        dropdown: 'var(--z-dropdown)',
        modal: 'var(--z-modal)',
      },
    },
  },

  plugins: [],
};

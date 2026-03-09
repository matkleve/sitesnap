# Auth Map Background

## What It Is

A decorative, non-interactive map layer shown behind the auth card on the Login and Register screens. It provides map-first product context before authentication without adding interaction complexity.

## What It Looks Like

The map fills the entire viewport behind the auth card and is fixed to a single city location. The map is softened with a warm overlay so form text remains legible in bright and dark conditions. The auth card stays centered and visually elevated above the map. On mobile, the card remains full-width constrained and the background map remains visible with the same framing.

## Where It Lives

- **Route**: `/auth/login` and `/auth/register`
- **Parent**: `LoginComponent` and `RegisterComponent`
- **Appears when**: Auth shell renders with map background modifier class

## Actions

| #   | User Action           | System Response                                                      | Triggers               |
| --- | --------------------- | -------------------------------------------------------------------- | ---------------------- |
| 1   | Navigates to login    | Fixed city map background appears behind auth card                   | Route `/auth/login`    |
| 2   | Navigates to register | Fixed city map background appears behind auth card                   | Route `/auth/register` |
| 3   | Resizes viewport      | Background remains full-bleed; auth card stays centered and readable | CSS responsive layout  |

## Component Hierarchy

```
AuthShell (auth-shell auth-shell--map)                    ← full viewport, relative, centered card
├── AuthMapBackground (auth-map-bg)                       ← absolute inset, decorative layer
│   └── AuthMapFrame (iframe.auth-map-frame)              ← fixed-location OSM embed, non-interactive
├── AuthMapOverlay (auth-map-overlay)                     ← contrast veil for readability
└── AuthCard (auth-card)                                  ← foreground sign-in / register form
```

## Data

| Field         | Source                                               | Type     |
| ------------- | ---------------------------------------------------- | -------- |
| `mapEmbedUrl` | Static OpenStreetMap embed URL (fixed bbox + marker) | `string` |

## State

| Name               | Type                               | Default                  | Controls                                     |
| ------------------ | ---------------------------------- | ------------------------ | -------------------------------------------- |
| `hasMapBackground` | `boolean` (via CSS class presence) | `true` on login/register | Whether the map background layer is rendered |

## File Map

| File                                                              | Purpose                                     |
| ----------------------------------------------------------------- | ------------------------------------------- |
| `docs/element-specs/auth-map-background.md`                       | Contract for auth background map behavior   |
| `apps/web/src/app/features/auth/auth.styles.scss`                 | Shared auth styles for map background layer |
| `apps/web/src/app/features/auth/login/login.component.html`       | Enables map background on login             |
| `apps/web/src/app/features/auth/register/register.component.html` | Enables map background on register          |

## Wiring

- Add `auth-shell--map` modifier class in login/register templates.
- Render `auth-map-bg` and `auth-map-overlay` as siblings before `auth-card`.
- Keep map layer `aria-hidden` and non-focusable.
- Keep existing auth form logic unchanged.

## Acceptance Criteria

- [ ] Login page shows a fixed city map behind the auth card.
- [ ] Register page shows the same fixed city map behind the auth card.
- [ ] The map layer is non-interactive and does not capture focus.
- [ ] Text and controls remain legible over the background in light and dark themes.
- [ ] Layout remains usable on mobile and desktop.

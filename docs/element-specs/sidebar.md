# Sidebar

## What It Is

The main navigation rail. Desktop: a frosted-glass pill floating on the left that expands on hover to show labels. Mobile: a fixed bottom tab bar. Contains nav links to Map, Photos, Groups, Settings, and a user avatar at the bottom.

## What It Looks Like

**Desktop (≥768px):** Collapsed = 48px wide pill, left edge, vertically centered. On hover expands to 240px showing icon + label. Frosted glass background (`backdrop-filter: blur`). Contains 4 nav items stacked vertically + avatar slot at bottom.

**Mobile (<768px):** Fixed bottom bar spanning full width, 56px tall. Icons only, evenly spaced. No avatar (avatar moves to account page).

Warm surface: `--color-bg-surface` at 85% opacity with blur. Active nav link highlighted with `--color-clay`.

Source of truth for standardized sizing/tokens:

- Use `docs/design/tokens.md` for spacing, widths, radius, and icon sizing.
- Use `docs/design/layout.md` for breakpoint and shell layout rules.
- Use `docs/design/motion.md` for motion timing.
- This element spec defines component structure and behavior; if values conflict, the relevant `docs/design/*` file wins.

## Where It Lives

- **Parent**: `MapShellComponent` template (desktop) / `AppComponent` template (mobile bottom bar)
- **Component**: `NavComponent` at `features/nav/`

## NavLink States

Every nav link has these visual states. Agents must implement **all** of them — not just active.

| State         | Background                           | Text / Icon color        | Extra                                                                | Transition |
| ------------- | ------------------------------------ | ------------------------ | -------------------------------------------------------------------- | ---------- |
| Default       | `transparent`                        | `--color-text-secondary` | —                                                                    | —          |
| Hover         | `--color-bg-elevated` at 40% opacity | `--color-text-primary`   | —                                                                    | 80ms       |
| Active route  | `--color-clay` at 12% opacity        | `--color-clay`           | 3px left border `--color-clay` (desktop), 2px bottom border (mobile) | —          |
| Focus-visible | `transparent`                        | `--color-text-primary`   | 2px `--color-primary` focus ring, 2px offset                         | instant    |
| Pressed       | `--color-bg-elevated` at 55% opacity | `--color-text-primary`   | —                                                                    | 40ms       |
| Disabled      | `transparent`                        | `--color-text-disabled`  | `pointer-events: none`, `aria-disabled="true"`, `opacity: 0.6`       | —          |

**Dark mode:** All tokens resolve correctly. The frosted glass (85% opacity `--color-bg-surface` + `backdrop-filter: blur(12px)`) must be verified against both `--color-bg-base` values — light `#F9F7F4` and dark `#0F0E0C`.

**Avatar states:**

| State               | Visual                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| User loaded         | Circle with first letter of email, `--color-clay` background, white text |
| User null / loading | Circle with `?` placeholder, `--color-bg-elevated` background            |
| Hover               | `ring-2 ring-offset-2 --color-primary`                                   |
| Focus-visible       | Same as hover + 2px `--color-primary` focus ring                         |

## Spacing & Sizing

All values from the 4px base unit scale (`docs/design/tokens.md` §3.3). **No ad-hoc values.**

### Desktop sidebar

| Property                      | Value                               | Tailwind                     |
| ----------------------------- | ----------------------------------- | ---------------------------- |
| Collapsed width               | 48px                                | `w-12`                       |
| Expanded width                | 240px                               | `w-60`                       |
| Outer padding (top + bottom)  | 16px                                | `py-4`                       |
| Outer padding (left + right)  | 8px (collapsed), 12px (expanded)    | `px-2` / `px-3`              |
| Gap between nav items         | 4px                                 | `gap-1`                      |
| NavLink internal padding      | 8px vertical, 12px horizontal       | `py-2 px-3`                  |
| NavLink border-radius         | 8px                                 | `rounded-lg`                 |
| Icon size                     | 20px                                | `text-xl` (Material Symbols) |
| Icon-to-label gap (expanded)  | 12px                                | `gap-3`                      |
| Label font size               | 14px (0.875rem)                     | `text-sm`                    |
| Avatar diameter               | 32px                                | `w-8 h-8`                    |
| Avatar bottom margin          | 0 (flush with `py-4` outer padding) | —                            |
| Expand/collapse transition    | 150ms                               | `duration-150`               |
| Expand easing                 | `ease-out`                          | `ease-out`                   |
| Sidebar border-radius         | 12px                                | `rounded-xl`                 |
| Sidebar shadow                | `shadow-md`                         | `shadow-md`                  |
| Sidebar left offset from edge | 12px                                | `left-3`                     |
| Sidebar vertical centering    | `top-1/2 -translate-y-1/2`          | —                            |

### Mobile bottom bar

| Property                          | Value                            | Tailwind                           |
| --------------------------------- | -------------------------------- | ---------------------------------- |
| Bar height                        | 56px                             | `h-14`                             |
| Bar horizontal padding            | 16px                             | `px-4`                             |
| Safe area bottom                  | `env(safe-area-inset-bottom)`    | `pb-[env(safe-area-inset-bottom)]` |
| Item distribution                 | Even                             | `justify-around`                   |
| Icon size                         | 24px                             | `text-2xl`                         |
| Active indicator                  | 2px bottom border `--color-clay` | —                                  |
| No avatar (moves to account page) | —                                | —                                  |

### SidebarPill affordance (collapsed only)

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Width         | 4px                                     |
| Height        | 40px                                    |
| Color         | `--color-border-strong`                 |
| Border-radius | 2px                                     |
| Position      | centered, 50% height                    |
| Behavior      | fades out on expand (`opacity 0`, 80ms) |

## Keyboard Contract

| Key               | Context          | Behavior                                                          |
| ----------------- | ---------------- | ----------------------------------------------------------------- |
| `Tab`             | Page             | Moves focus into sidebar, then through each nav link in DOM order |
| `Shift+Tab`       | First nav link   | Moves focus out of sidebar to previous page element               |
| `Enter` / `Space` | Focused nav link | Activates the link (navigates to route)                           |
| `Enter` / `Space` | Focused avatar   | Navigates to `/account`                                           |
| `ArrowDown`       | Inside sidebar   | Moves focus to next nav link (wraps to first after avatar)        |
| `ArrowUp`         | Inside sidebar   | Moves focus to previous nav link (wraps to avatar after first)    |
| `Escape`          | Sidebar focused  | Moves focus to the map (returns keyboard control to map pane)     |

**Focus behavior on expand:** When a nav link receives keyboard focus, the sidebar expands to show labels (same as hover). It collapses when focus leaves the sidebar entirely.

**ARIA:** The `<nav>` element has `aria-label="Main navigation"`. Each link uses `routerLinkActive` to set `aria-current="page"` on the active route.

## Actions

| #   | User Action                 | System Response                    | Triggers                      |
| --- | --------------------------- | ---------------------------------- | ----------------------------- |
| 1   | Hovers sidebar (desktop)    | Sidebar expands, shows labels      | CSS transition 150ms ease-out |
| 2   | Mouse leaves sidebar        | Sidebar collapses to icons         | CSS transition 150ms ease-out |
| 3   | Clicks nav link             | Navigates to route                 | Angular Router                |
| 4   | Clicks disabled nav link    | Nothing (pointer-events: none)     | —                             |
| 5   | Clicks avatar slot          | Navigates to `/account`            | Angular Router                |
| 6   | Resizes below 768px         | Sidebar becomes bottom tab bar     | CSS media query               |
| 7   | Focuses nav link (keyboard) | Sidebar expands (same as hover)    | Focus-within trigger          |
| 8   | Focus leaves sidebar        | Sidebar collapses (if not hovered) | Focus-out                     |

## Component Hierarchy

```
Sidebar                                    ← nav element, fixed/absolute left, frosted glass
├── SidebarPanel                           ← inner flex column, gap between items
│   ├── NavLink "Map"                      ← icon: map, route: /
│   ├── NavLink "Photos"                   ← icon: photo_camera, route: /photos
│   ├── NavLink "Groups"                   ← icon: folder, route: /groups
│   ├── NavLink "Settings"                 ← icon: settings, route: /settings
│   ├── Spacer                             ← flex-1 pushes avatar to bottom
│   └── AvatarSlot                         ← circle with user initial, links to /account
└── SidebarPill                            ← 40×4px pill affordance at 50% height (collapsed only)
```

### NavLink (repeated child)

Each link: Material Icon (20px) + label text. Active state via `routerLinkActive`. Disabled items get `aria-disabled="true"` and muted styling.

## Data

| Field                           | Source                 | Type           |
| ------------------------------- | ---------------------- | -------------- |
| User email (for avatar initial) | `AuthService.user()`   | `User \| null` |
| Nav items                       | Hardcoded in component | `NavItem[]`    |

## State

| Name       | Type      | Default | Controls                                      |
| ---------- | --------- | ------- | --------------------------------------------- |
| `expanded` | `boolean` | `false` | Desktop hover expand (CSS-driven, not signal) |

## File Map

| File                              | Purpose                    |
| --------------------------------- | -------------------------- |
| `features/nav/nav.component.ts`   | Component (already exists) |
| `features/nav/nav.component.html` | Template (already exists)  |
| `features/nav/nav.component.scss` | Styles (already exists)    |

## Wiring

- Imported directly in `MapShellComponent` template
- Uses `RouterLink` and `RouterLinkActive` for navigation
- `AuthService` injected for avatar initial

## Acceptance Criteria

### Structure

- [x] Desktop: pill on left, expands on hover (150ms ease-out transition)
- [x] Desktop: shows icon + label when expanded, icon only when collapsed
- [x] Desktop: width matches design system (48px collapsed → 240px expanded)
- [x] Mobile: bottom tab bar, icons only, 56px tall
- [x] Frosted glass effect on supporting browsers (with fallback solid bg)

### States (all required)

- [ ] NavLink default: transparent bg, `--color-text-secondary`
- [ ] NavLink hover: `--color-bg-elevated` at 40%, `--color-text-primary`, 80ms
- [ ] NavLink active route: `--color-clay` at 12% bg, `--color-clay` text/icon, 3px left border (desktop) / 2px bottom border (mobile)
- [ ] NavLink focus-visible: 2px `--color-primary` ring, 2px offset
- [ ] NavLink pressed: `--color-bg-elevated` at 55%
- [ ] NavLink disabled: `--color-text-disabled`, `opacity: 0.6`, `pointer-events: none`, `aria-disabled`
- [ ] Avatar loaded: first letter of email, `--color-clay` bg
- [ ] Avatar null/loading: `?` placeholder, `--color-bg-elevated` bg
- [ ] Avatar hover: `ring-2 --color-primary`
- [ ] Dark mode: frosted glass readable against `#0F0E0C` base

### Spacing (no ad-hoc values)

- [ ] Outer padding: `py-4 px-2` (collapsed) / `py-4 px-3` (expanded)
- [ ] Nav item gap: `gap-1` (4px)
- [ ] NavLink padding: `py-2 px-3`
- [ ] Icon-to-label gap: `gap-3` (12px)
- [ ] Mobile: `h-14 px-4 justify-around` + `env(safe-area-inset-bottom)`

### Keyboard

- [ ] `Tab` / `Shift+Tab` moves in/out of sidebar
- [ ] `ArrowDown` / `ArrowUp` moves between nav links
- [ ] `Enter` / `Space` activates focused link
- [ ] `Escape` returns focus to map
- [ ] Keyboard focus expands sidebar (same as hover)
- [ ] `aria-label="Main navigation"` on `<nav>`
- [ ] `aria-current="page"` on active route link

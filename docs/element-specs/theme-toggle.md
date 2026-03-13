# Theme Toggle

## What It Is

A small control that cycles the app's color theme between **light**, **dark**, and **system** (follows OS preference). Located in the Sidebar on desktop, in Settings page, and potentially in a floating control cluster.

## What It Looks Like

Icon button showing the current theme state: sun (light), moon (dark), or monitor (system). On click, cycles to the next mode. No dropdown — simple three-state toggle. Uses `--color-text-secondary` icon color, same sizing as other sidebar icons.

## Where It Lives

- **Parent**: Sidebar (desktop rail), Settings page
- **Position**: Bottom of sidebar rail, above account icon

## Actions

| #   | User Action                             | System Response                                    | Triggers                                  |
| --- | --------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| 1   | Clicks toggle (light → dark)            | Applies dark theme, icon changes to moon           | CSS class on `<html>`, localStorage write |
| 2   | Clicks toggle (dark → system)           | Applies system preference, icon changes to monitor | `prefers-color-scheme` media query        |
| 3   | Clicks toggle (system → light)          | Applies light theme, icon changes to sun           | CSS class on `<html>`, localStorage write |
| 4   | OS theme changes while in "system" mode | App theme follows OS change                        | Media query listener                      |

## Component Hierarchy

```
ThemeToggle                                ← icon button, same size as sidebar icons
└── ThemeIcon                              ← sun / moon / monitor depending on mode
```

## Data

| Field          | Source                     | Type                            |
| -------------- | -------------------------- | ------------------------------- |
| Current theme  | `ThemeService.themeMode()` | `'light' \| 'dark' \| 'system'` |
| Persisted pref | `localStorage('theme')`    | `string \| null`                |

## State

| Name            | Type                            | Default    | Controls                               |
| --------------- | ------------------------------- | ---------- | -------------------------------------- |
| `themeMode`     | `'light' \| 'dark' \| 'system'` | `'system'` | Which theme is active                  |
| `resolvedTheme` | `'light' \| 'dark'`             | derived    | Actual applied theme (resolves system) |

Persisted in `localStorage` under key `feldpost-theme`.

## File Map

| File                                     | Purpose                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `core/theme.service.ts`                  | Theme state, persistence, media query listener |
| `features/nav/theme-toggle.component.ts` | Toggle button component                        |

## Wiring

- Import `ThemeToggleComponent` in `SidebarComponent`
- Place at bottom of sidebar rail, above account icon
- Inject `ThemeService` in component constructor
- Also import in `SettingsComponent` for settings page theme control

## Acceptance Criteria

- [ ] Three-state cycle: light → dark → system → light
- [ ] Icon changes to reflect current mode
- [ ] Theme persists across sessions (localStorage)
- [ ] "System" mode follows OS `prefers-color-scheme`
- [ ] Transition between themes uses 120–250ms animation
- [ ] All design tokens switch correctly (--color-bg-base, --color-bg-surface, etc.)

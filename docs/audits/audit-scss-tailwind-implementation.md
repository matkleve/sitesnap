# SCSS + Tailwind Implementation Audit

**Date:** 2026-03-04  
**Scope:** `apps/web` styling architecture, global tokens, component SCSS, and Tailwind integration  
**Goal:** Identify design-system drift, SCSS/Tailwind inconsistencies, and implementation risks

---

## Executive Summary

The project has a strong token foundation in `src/styles.scss` and a well-structured Tailwind theme in `tailwind.config.js`, but the implementation is currently **SCSS-dominant with near-zero Tailwind utility usage**. This creates an architecture mismatch: Tailwind is configured as a token/runtime surface, yet the app does not consume it.

The largest issues are:

1. Tailwind is present but effectively unused.
2. Design tokens are partially implemented (missing map/type token layers from `docs/design/tokens.md` and `docs/design/map-system.md`).
3. Component SCSS frequently bypasses tokens with raw values.
4. Accessibility-focused interaction styles (`:focus-visible`, minimum hit targets) are inconsistent.
5. Some design dimensions in implementation diverge from documented design constraints.

---

## Findings (Prioritized)

## 1) Tailwind configured but not materially used

**Severity:** High  
**Evidence:** `apps/web/tailwind.config.js`, `apps/web/src/styles.scss`, HTML templates in `apps/web/src/app/features/**`  
**What was found:**

- `@tailwind base/components/utilities` is enabled globally.
- Extended theme tokens are defined (colors, spacing aliases, radius, shadows, z-index, typography).
- No meaningful Tailwind utility usage appears in templates.
- No `@apply` usage and no component layer abstractions (`@layer components`) in code.

**Impact:**

- Extra cognitive/build complexity with limited product value.
- Token naming and utility definitions can drift unnoticed because they are not exercised.

**Recommendation:**

- Choose one explicit strategy:
  - **SCSS-first:** keep Tailwind only for reset/utilities you actively use, remove unused theme extensions.
  - **Hybrid/Tailwind-forward:** migrate high-frequency primitives (layout, spacing, typography, state styles) to utilities and keep SCSS for complex interactions.

---

## 2) Design token coverage is incomplete vs `docs/design/tokens.md`

**Severity:** High  
**Evidence:** `docs/design/tokens.md`, `docs/design/map-system.md`, `apps/web/src/styles.scss`, `apps/web/tailwind.config.js`  
**What was found:**

- Core color tokens exist and are consistent.
- `docs/design/tokens.md` includes additional semantic surface/type guidance (e.g. map-specific and typography token model), but implementation does not fully expose these as global tokens/utilities.
- `--color-bg-map` is documented but not present in `styles.scss`.

**Impact:**

- Components and map styling rely on ad-hoc values rather than complete semantic tokenization.
- Harder to enforce consistent theming and dark-mode behavior across future features.

**Recommendation:**

- Add missing semantic tokens from `docs/design/tokens.md` to `styles.scss`.
- Mirror those tokens into Tailwind only when the team will actually consume utility classes.

---

## 3) Raw color values are still used in component SCSS

**Severity:** High  
**Evidence:**

- `apps/web/src/app/features/auth/auth.styles.scss`
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.scss`

**What was found:**

- Auth and upload styles use raw hex (`#fee2e2`, `#fca5a5`, `#eff6ff`, `#dbeafe`, `#f0fdf4`, etc.) and fixed white `#fff`.
- Focus ring in auth uses hard-coded RGBA rather than a semantic tokenized ring/tint system.

**Impact:**

- Weakens dark-mode parity and increases maintenance burden.
- Color consistency depends on manual review rather than token guarantees.

**Recommendation:**

- Introduce semantic tint tokens (e.g. `--color-danger-subtle`, `--color-primary-subtle`, `--color-success-subtle`, `--color-warning-subtle`, `--focus-ring`).
- Replace remaining hex/RGBA values with these tokens.

---

## 4) Spacing/radius usage is inconsistent despite token availability

**Severity:** Medium  
**Evidence:** `nav.component.scss`, `map-shell.component.scss`, `upload-panel.component.scss`  
**What was found:**

- Mixed use of `var(--spacing-*)`, `rem`, and hard-coded px values in the same components.
- Non-token radius values (`3px`) are still used alongside radius tokens.

**Impact:**

- Visual rhythm and density become harder to scale globally.
- Token updates do not fully propagate.

**Recommendation:**

- Standardize: token-based spacing for internal rhythm, `rem` for structural dimensions only.
- Replace fixed radii with `--radius-sm/md/lg/full`.

---

## 5) Interactive focus states are incomplete

**Severity:** High  
**Evidence:** `nav.component.scss`, `map-shell.component.scss`, `upload-panel.component.scss`, auth templates/styles  
**What was found:**

- Many interactive elements define `:hover` but no dedicated `:focus-visible` style.
- Keyboard users may receive weak/no visual focus indication on critical controls.

**Impact:**

- Accessibility regression risk and reduced operability for keyboard-only workflows.

**Recommendation:**

- Add a global focus contract (`:focus-visible` ring token + offset).
- Enforce focus parity wherever hover styles exist.

---

## 6) Hit target sizing is not consistently enforced

**Severity:** Medium  
**Evidence:** `upload-panel.component.scss`, `tailwind.config.js`  
**What was found:**

- Tailwind defines `minHeight.tap`/`tap-lg`, but component SCSS does not consistently enforce minimum click/tap areas.
- Small controls (e.g., retry/dismiss buttons) appear visually below documented minimum target guidance.

**Impact:**

- Reduced usability in field/mobile contexts.

**Recommendation:**

- Introduce shared control-size utilities/mixins and apply to all interactive elements.
- Audit all icon/text buttons against 44x44 (or documented desktop/mobile minimums).

---

## 7) Breakpoint strategy is duplicated and hard-coded

**Severity:** Medium  
**Evidence:** `nav.component.scss`, `map-shell.component.scss`  
**What was found:**

- Repeated `@media (min-width: 768px)` / `@media (max-width: 767px)` blocks across components.

**Impact:**

- Increases maintenance risk if breakpoint policy changes.

**Recommendation:**

- Centralize breakpoints in Sass variables/mixins or align with Tailwind breakpoints and utility classes.

---

## 8) Z-index semantics are defined, but usage is inconsistent

**Severity:** Medium  
**Evidence:** `styles.scss`, `map-shell.component.scss`  
**What was found:**

- Global z-index ladder exists.
- Multiple overlays share `--z-upload-button` where semantically distinct layers (search/dropdown/panel) would benefit from their own levels.

**Impact:**

- Overlay collision bugs become likely as more UI layers are added.

**Recommendation:**

- Map each overlay role to its semantic z-token (`map`, `panel`, `dropdown`, `modal`, etc.) and avoid role reuse.

---

## 9) Upload panel positioning model is brittle

**Severity:** Medium  
**Evidence:** `map-shell.component.html`, `map-shell.component.scss`, `upload-panel.component.scss`  
**What was found:**

- Upload panel is nested in an expandable container and also positioned with absolute offsets inside its own component styles.

**Impact:**

- Positioning logic becomes coupled and fragile across responsive/layout changes.

**Recommendation:**

- Use a single ownership model for placement:
  - parent container owns geometry, child owns internals; or
  - child fully positions itself and parent is passive.

---

## 10) Nav implementation diverges from documented design dimensions

**Severity:** Medium  
**Evidence:** `docs/design/layout.md`, `nav.component.scss`  
**What was found:**

- Design doc calls out wider expanded sidebar dimensions; current nav uses significantly narrower expanded width.

**Impact:**

- Label readability and interaction affordance may diverge from approved design intent.

**Recommendation:**

- Reconcile documented sidebar sizes with implemented values and choose one source of truth.

---

## 11) Placeholder page styling is repeated inline in TS components

**Severity:** Low  
**Evidence:** `account.component.ts`, `groups.component.ts`, `photos.component.ts`, `settings.component.ts`  
**What was found:**

- Same `.page-placeholder` style block repeated in four components via inline `styles`.

**Impact:**

- Avoidable duplication and drift risk.

**Recommendation:**

- Move placeholder style to a shared SCSS partial or utility class.

---

## 12) SCSS comments indicate unresolved token gaps

**Severity:** Low  
**Evidence:** `auth.styles.scss`, `upload-panel.component.scss` comments  
**What was found:**

- Multiple comments explicitly note missing exact tokens for tints and state backgrounds.

**Impact:**

- Team already recognizes gaps; without follow-through these become permanent exceptions.

**Recommendation:**

- Convert comment-level exceptions into formal design tokens and close the loop.

---

## Open SCSS/Tailwind Backlog (Triaged)

Status values: `Open`, `In Progress`, `Done`, `Won’t Do`  
Priority values: `P0` (blocker), `P1` (high), `P2` (polish)

| ID     | Priority | Status | Area           | Open Item                                                                                                    | Milestone                  |
| ------ | -------- | ------ | -------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| CSS-01 | P0       | Open   | Strategy       | Decide and document style strategy (`SCSS-first` or `Hybrid Tailwind`) and enforce it in contribution rules. | M-UI1, M10                 |
| CSS-02 | P0       | Open   | Tokens         | Add missing semantic tokens from `docs/design/tokens.md` (map/type/tint/focus token gaps).                   | M-UI1                      |
| CSS-03 | P0       | Open   | Consistency    | Remove remaining raw hex/RGBA color values from component SCSS.                                              | M-UI1                      |
| CSS-04 | P1       | Open   | Accessibility  | Implement global `:focus-visible` contract and apply parity where hover exists.                              | M-UI1, M-UI4               |
| CSS-05 | P1       | Open   | Accessibility  | Enforce minimum tap/click target policy for icon/text controls.                                              | M-UI4, M-UI5, M-UI6        |
| CSS-06 | P1       | Open   | Layout         | Normalize z-index role mapping (`map`, `panel`, `dropdown`, `modal`) to avoid collisions.                    | M-UI4, M-UI5               |
| CSS-07 | P1       | Open   | Layout         | Resolve upload panel positioning ownership (single geometry owner pattern).                                  | M-UI5                      |
| CSS-08 | P1       | Open   | Responsiveness | Centralize breakpoints via shared Sass mixins or Tailwind breakpoint policy.                                 | M-UI6, M-UI7               |
| CSS-09 | P2       | Open   | Duplication    | Remove repeated inline placeholder styling and replace with shared primitive.                                | M-UI6, M-UI7, M-UI8, M-UI9 |
| CSS-10 | P2       | Open   | Motion         | Ensure transition/animation contract respects `prefers-reduced-motion`.                                      | M-UI1, M-UI3               |

---

## Quick Wins (Next Session)

- Add semantic subtle/tint/focus tokens in `styles.scss`.
- Replace hard-coded auth/upload hex values with semantic tokens.
- Add global `:focus-visible` rule and patch primary interactive controls.
- Resolve nav width discrepancy against `docs/design/layout.md` and lock the source of truth.

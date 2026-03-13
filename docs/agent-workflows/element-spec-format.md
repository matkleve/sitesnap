# Element Spec Format

Every UI element in Feldpost must have a spec in `docs/element-specs/` before agent implementation. This is the template.

---

## Template Structure

Each spec has these sections in this order. **Order matters** — agents read top-down and the short sections at the top prevent hallucination.

### 1. Title + "What It Is" (1–2 sentences)

Plain English. What is this thing? What does the user do with it?

### 2. What It Looks Like (3–5 sentences)

Visual appearance in plain words. Reference design tokens, sizes, rough layout. Enough for an agent to set up the right Tailwind classes.

### 3. Where It Lives

Route, parent component, and trigger condition. The agent needs to know where to wire it in.

### 4. Actions & Interactions (table)

Every user action and system response. If it's not in this table, the agent won't build it.

| #   | User Action | System Response | Triggers        |
| --- | ----------- | --------------- | --------------- |
| 1   | Clicks X    | Y happens       | navigates to /z |

### 5. Component Hierarchy (tree diagram)

The most important section. Shows what nests inside what, using a simple tree diagram (not real HTML or Angular template code). Each node = a component or visual area. Include:

- Position/sizing hints as inline notes
- Conditional visibility in `[brackets]`
- Short description of what each node renders

Keep it readable — this is a structural guideline, not copy-pasteable code.

When a panel or list row matches an existing shared primitive, name it directly in the hierarchy (`.ui-container`, `.ui-item`, `.ui-item-media`, `.ui-item-label`, `.ui-spacer`) instead of describing new bespoke geometry.

### 6. Data (table)

Where does data come from? Which Supabase tables, which columns, which service methods. Heading: `## Data`.

### 7. State (table)

Every piece of state: name, TypeScript type, default value, what it controls.

### 8. File Map (table)

Every file to create, with a 1-phrase purpose. Agent creates exactly these files.

### 9. Wiring

How this element connects to its parent. Route config, component imports, service injections.

### 10. Acceptance Criteria (checklist)

Checkbox list. Each item is testable. Used for verification after implementation.

---

## Example Spec Skeleton

```markdown
# [Element Name]

## What It Is

[1-2 sentences]

## What It Looks Like

[3-5 sentences with visual description, sizes, colors, design token references]

## Where It Lives

- **Route**: `/path` or "global — available on every page"
- **Parent**: `ParentComponent` in `path/to/parent.ts`
- **Appears when**: [trigger condition]

## Actions

| #   | User Action | System Response | Triggers |
| --- | ----------- | --------------- | -------- |
| 1   | ...         | ...             | ...      |

## Component Hierarchy

<!-- Tree diagram showing nesting, not real code -->
```

ElementRoot ← positioning, size, role
├── SubArea ← what this area does
│ ├── ChildA ← brief description
│ └── ChildB ← brief description
│
└── [conditional] AnotherArea
├── ChildC × N ← repeated for each item
└── EmptyState ← shown when no items

```

## Data

| Field | Source | Type |
|-------|--------|------|
| items | `supabase.from('table').select('...')` | `Type[]` |

## State

| Name | Type | Default | Controls |
|------|------|---------|----------|
| isOpen | `boolean` | `false` | panel visibility |

## File Map

| File | Purpose |
|------|---------|
| `features/x/x.component.ts` | root component |
| `features/x/x.component.html` | template |
| `core/x.service.ts` | data access |

## Wiring

- Import `XComponent` in `parent.component.ts`
- Add route in `app.routes.ts` (if routed)
- Inject `XService` in component constructor

## Acceptance Criteria

- [ ] Specific testable behavior 1
- [ ] Specific testable behavior 2
```

---

## Why This Format Works

| Section             | What it prevents                                        |
| ------------------- | ------------------------------------------------------- |
| What It Is          | Agent misunderstanding the element's purpose            |
| What It Looks Like  | Agent guessing visual dimensions, colors, or layout     |
| Where It Lives      | Agent placing the component in the wrong parent or zone |
| Actions table       | Agent skipping unlisted behaviors                       |
| Hierarchy tree      | Agent guessing the component nesting                    |
| Data table          | Agent inventing fake APIs or queries                    |
| State table         | Agent adding extra unnecessary state                    |
| File Map            | Agent putting files in wrong places                     |
| Wiring              | Agent forgetting to connect the component to its parent |
| Acceptance Criteria | Unchecked bugs after generation                         |

## Rules

- Every glossary UI element MUST have a spec before implementation
- Specs are the **source of truth** — code must match spec, not the other way around
- Update specs BEFORE asking agents to modify features
- Keep "What It Is" and "What It Looks Like" short — detail goes in Actions and Hierarchy
- Prefer shared layout primitives in the spec before inventing new panel or row patterns
- Use `rem` as the primary unit for accessibility-sensitive UI dimensions: touch targets, button heights, interactive sizes, spacing, and layout dimensions. Include the px equivalent as an annotation when the exact reference size matters.
- Use `em` only for component-internal spacing that should scale with the component's own font size.
- Use `px` only for precision details that should not scale with font size: borders, outlines, shadows, image display sizes, and pixel-resolution thresholds.
- Use `vh` / `vw` only for viewport-relative layout behavior.

# Element Spec Format

Every UI element in Sitesnap must have a spec in `docs/element-specs/` before agent implementation. This is the template.

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

The most important section. Shows what nests inside what, using a simple tree diagram. Each node = a component or visual area.

### 6. Data Requirements (table)

Where does data come from? Which Supabase tables, which columns, which service methods.

### 7. State (table)

Every piece of state: name, TypeScript type, default value, what it controls.

### 8. File Map (table)

Every file to create, with a 1-phrase purpose. Agent creates exactly these files.

### 9. Wiring

How this element connects to its parent. Route config, component imports, service injections.

### 10. Acceptance Criteria (checklist)

Checkbox list. Each item is testable. Used for verification after implementation.

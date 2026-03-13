# Element Specs

Last updated: 2026-03-13

Structured implementation contracts for every UI element in Feldpost.
These are the **source of truth** that agents implement from.

See [agent-workflows/element-spec-format.md](../agent-workflows/element-spec-format.md) for the template.

## See Also

- [Glossary](../glossary.md)
- [Design overview](../design.md)
- [Design layout rules](../design/layout.md)
- [Design tokens](../design/tokens.md)

## How To Use

### Agent Flow

1. Resolve the target element from the list below (canonical naming from [Glossary](../glossary.md)).
2. Open the element spec and treat it as implementation contract.
3. Check `docs/implementation-blueprints/` for service signatures, data-flow diagrams, and query details.
4. Use `#plan-before-build`, then `#implement-element`.
5. Run `#review-against-spec` and update acceptance checkboxes if required.
6. Enforce the **Spec Structure Contract** below; do not model new specs after a "best example" file.

### Product Owner / Human Flow

1. Confirm whether the feature already has a spec in the list below.
2. If missing, create a new spec with the template in [agent-workflows/element-spec-format.md](../agent-workflows/element-spec-format.md).
3. Link or request an implementation blueprint when behavior spans multiple services.
4. Prioritize review/splitting work from the Priority section.
5. Hand off to agent implementation only after spec acceptance criteria are clear and testable.

## Spec Structure Contract

All specs follow one shared core structure. This is the standard for future specs and for gradual backfills of older specs.

### Core Sections (Required, exact order)

1. `What It Is`
2. `What It Looks Like`
3. `Where It Lives`
4. `Actions`
5. `Component Hierarchy`
6. `Data`
7. `State`
8. `File Map`
9. `Wiring`
   Required sub-sections (in this order):
   - `### Injected Services` — list every injected service,
     store, or token with one-line purpose
   - `### Inputs / Outputs` — all @Input() and @Output()
     bindings with types
   - `### Subscriptions` — every Observable or Signal
     subscription; note where it is torn down
   - `### Supabase Calls` — list every direct Supabase call
     with table, operation, and trigger condition; write
     "None — delegated to [ServiceName]" if calls live in
     a service instead

   If a sub-section is not applicable, keep the heading and
   write "None."
   A sequenceDiagram Mermaid is REQUIRED in the Wiring section
   whenever there are 2 or more Supabase calls OR the component
   coordinates across 2 or more services. The diagram must show
   the full request/response flow including error branches.

10. `Acceptance Criteria`

Rules:

- Every spec must contain all core section headings, in this order.
- If a core section is not applicable, keep the heading and write `Not applicable — <reason>`.
- Place any additional sections only **after** core sections, unless they are explicitly declared as a pre-core exception (for example `Child Specs` in split parent specs).
- This repository has no canonical reference spec file; the contract above is the canonical source.

### Optional Sections (Type-Specific)

Use optional sections when they materially improve implementation clarity.

UI-heavy spec options:

- `Responsive Layout`
- `Design Tokens`
- `Accessibility`
- `Visual States`
- `Interaction Flow`

Service-heavy spec options:

- `State Machine`
- `Event Streams`
- `Supabase Storage Calls`
- `Cache Lifecycle`
- `Failure Modes`

Cross-cutting options:

- `Use Cases`
- `Data Pipeline`
- `Lifecycle` flows
- `Child Specs` (split parent specs only)
- `Settings` (optional section used by configurable features)

`## Settings` convention:

- Use this section to list user-configurable settings exposed by the spec.
- Recommended bullet format per item: `- **<Section>**: <what it configures>`.
- Keep it concise and user-facing (for example: Theme, Notifications, Roles & Permissions).
- When present, entries must be reflected in `docs/settings-registry.md`.

Guidance: prefer one general structure with required core sections plus optional sections, rather than separate templates per element type.

### Mermaid Diagram Policy

Use Mermaid when behavior is temporal, stateful, or multi-source. Diagrams are not required for every spec.

Required:

- Include a `stateDiagram-v2` when a spec contains a `State Machine` section.
- Include a `sequenceDiagram` or `flowchart` when behavior depends on async orchestration (for example phased loading, retries, cancellation, dedup, fallback chains, or multi-service handoffs).
- Include a `flowchart TD` with decision nodes (`{ }`) when a spec's Actions or State section contains conditional branching logic (for example: permission checks, fallback chains, empty-state decisions, or feature-flag gates). Decision nodes must be labeled with the exact condition as written in the Actions section so agents can map them directly. If the same branching is already captured in a stateDiagram-v2, a separate flowchart is not required.
- For split specs, require at least one Mermaid diagram in the child spec that owns orchestration/state logic.

Optional:

- Purely visual/static UI specs with straightforward synchronous behavior.
- Cases where a compact table is clearer than a diagram.
- Parent specs that delegate complex behavior to child specs; parent may link to the child diagram instead of duplicating it.

Recommended limits and quality bar:

- Default target: 0-2 Mermaid diagrams per spec to avoid noise.
- Prefer one diagram per concern (state transitions, request pipeline, or lifecycle).
- Keep labels short and deterministic so reviewers can map diagram nodes to Actions/State terms.
- If a diagram drifts from the written contract, the written contract (sections + acceptance criteria) remains authoritative until updated.

## Lint & CI

Run `node scripts/lint-specs.mjs` from the project root to validate all specs. Rules:

| Rule                      | Severity   | Threshold | Description                                                                                                             |
| ------------------------- | ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `spec-max-lines`          | error/warn | 600 / 400 | Max lines per spec. Split oversized specs into parent + child specs with cross-references.                              |
| `spec-required-sections`  | error      | —         | Every spec must have: What It Is, What It Looks Like, Where It Lives, Actions, Component Hierarchy, Acceptance Criteria |
| `spec-section-order`      | warning    | —         | Sections should follow the canonical order from the template                                                            |
| `what-it-is-length`       | warning    | 5 lines   | Keep "What It Is" to 1–2 sentences                                                                                      |
| `what-it-looks-like-len`  | warning    | 40 lines  | Move visual detail to Actions or child specs                                                                            |
| `has-acceptance-criteria` | error      | —         | At least one `- [ ]` checkbox in Acceptance Criteria                                                                    |
| `settings-registry-sync`  | error      | —         | `docs/settings-registry.md` must match all `## Settings` entries found in specs                                         |

Lint is the minimum machine-enforced gate. The **Spec Structure Contract** above is the stricter authoring standard.

Use threshold overrides only for temporary migration/refactor waves where many legacy specs violate limits and you need a tracked, short-lived relaxation in CI:

`node scripts/lint-specs.mjs --max-lines=300 --warn-lines=250`

### Splitting Large Specs

When a spec exceeds the line limit, split it into a **parent spec** (layout, navigation, cross-references) and **child specs** (focused feature areas). The parent keeps the original filename and adds a "Child Specs" section with links.

## Elements (from [Glossary](../glossary.md))

Status: ✅ spec written | 🔲 needs spec

Order: grouped by UI layer from shell foundations through pages and cross-cutting features.

### Shell & Layout

- ✅ `map-shell.md` — Map Shell (top-level host)
- ✅ `map-zone.md` — Map Zone (flex container for map + floating controls)
- ✅ `sidebar.md` — Sidebar navigation rail
- ✅ `workspace-pane.md` — Right-side collapsible panel with group tabs
- ✅ `drag-divider.md` — Drag Divider (resizable map/workspace split)

### Search

- ✅ `search-bar.md` — Search Bar (multi-intent search surface)
- ✅ `search-bar-query-behavior.md` — Search Bar Query Behavior (formatting, ghost completion, forgiving matching)
- ✅ `search-bar-data-and-service.md` — Search Bar Data and Service (pipeline, ranking, geo-bias, service contract)

### Map Markers

- ✅ `photo-marker.md` — Photo Marker (square thumbnail marker + cluster)
- ✅ `user-location-marker.md` — GPS user location marker

### Upload

- ✅ `upload-button-zone.md` — Upload Button Zone (FAB toggle)
- ✅ `upload-panel.md` — Upload Panel (drop zone + file list)
- ✅ `placement-mode.md` — Placement Mode (banner + crosshair)

### Workspace & Groups

- ✅ `active-selection-view.md` — Active Selection View (composed workspace content: toolbar + grid + grouping + filtering)
- ✅ `group-tab-bar.md` — Group Tab Bar
- ✅ `thumbnail-grid.md` — Thumbnail Grid (virtual scrolling gallery)
- ✅ `thumbnail-card.md` — Thumbnail Card (128×128 with hover actions)
- ✅ `workspace-toolbar.md` — Workspace Toolbar (sort/group/view controls)
- ✅ `workspace-view-system.md` — Workspace View System (data pipeline architecture)

### Panels & Detail

- ✅ `filter-panel.md` — Filter Panel (accordion filters)
- ✅ `filter-dropdown.md` — Filter Dropdown (shared dropdown primitive)
- ✅ `projects-dropdown.md` — Projects Dropdown (project selection filter)
- ✅ `active-filter-chips.md` — Active Filter Chips Strip
- ✅ `image-detail-view.md` — Image Detail View (parent: layout, nav, quick info)
  - ✅ `image-detail-photo-viewer.md` — Photo Viewer (progressive loading, lightbox, replace/upload)
  - ✅ `image-detail-inline-editing.md` — Inline Editing (property rows, address search)
  - ✅ `image-detail-actions.md` — Actions & Marker Sync (correction mode, delete, sync)
- ✅ `sort-dropdown.md` — Sort Dropdown (thumbnail sort order)
- ✅ `grouping-dropdown.md` — Grouping Dropdown (thumbnail group-by)

### Controls

- ✅ `gps-button.md` — GPS Button (center on user location)
- ✅ `theme-toggle.md` — Theme Toggle (light / dark / system)
- ✅ `radius-selection.md` — Radius Selection (right-click-drag circle)

### Pages

- ✅ `auth-map-background.md` — Auth Map Background (fixed city backdrop for login/register)
- ✅ `photos-page.md` — Photos Page
- ✅ `groups-page.md` — Groups Page
- ✅ `settings-page.md` — Settings Page
- ✅ `account-page.md` — Account Page

### Features (cross-cutting)

- ✅ `custom-properties.md` — Custom Properties (user-defined metadata schema)

### Planned / Missing Specs

- 🔲 `qr-invite-flow.md` — QR invite and join flow (invite creation, scan/join, failure states)
- 🔲 `role-system.md` — Role and permission system UI (owner/admin/member permissions)
- 🔲 `slash-commands.md` — Slash command palette and action execution UX

## Priority

Priority is review-first, not "all done." Work the queue top-to-bottom unless product direction changes.

### Next Split Candidates

Check ESLint file.

1. Any spec above 400 lines (warning) should be reviewed for optional split.
2. Any spec above 600 lines (error) must be split before implementation changes continue.
3. Split by concern area, then add a "Child Specs" section in the parent with explicit links.

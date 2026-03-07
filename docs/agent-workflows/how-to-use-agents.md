# How to Use AI Agents Effectively in GeoSite

## Available Tools in VS Code

### Copilot Chat — quick questions, small edits

- `Ctrl+Shift+I` to open
- Ask about code, debug issues, generate small changes
- Use `@workspace` to search the whole codebase

### Copilot Agent Mode — multi-file feature work

- Same panel, agent mode toggle
- Agent reads files, runs terminal, creates/edits files autonomously
- **Best for**: implementing a full element from spec

### Prompt Files — reusable instructions

- Files in `.github/prompts/*.prompt.md`
- Reference in chat with `/` → select the prompt
- Available prompts:
  - `/plan-before-build` — routes to @planner agent
  - `/implement-element` — routes to @implementer agent
  - `/review-against-spec` — routes to @reviewer agent
  - `/audit-design` — design & accessibility audit
  - `/write-spec` — routes to @spec-writer agent

### Custom Agents — specialized roles

- Files in `.github/agents/*.agent.md`
- Invoke with `@` in chat: `@planner`, `@implementer`, `@reviewer`, `@spec-writer`
- Each has scoped tools and handoff → next agent

### AGENTS.md — auto-loaded workspace context

- `AGENTS.md` at root + nested in `apps/web/`, `supabase/`, `docs/`
- Loaded automatically when `chat.useAgentsMdFile` is enabled
- Replaces the old `.github/copilot-instructions.md`

### Skills — reusable domain knowledge

- `.github/skills/implement-from-spec/SKILL.md` — full spec-to-code workflow
- `.github/skills/write-element-spec/SKILL.md` — structured spec authoring

### File-Scoped Instructions

- `.github/instructions/*.instructions.md` — loaded based on file pattern (e.g., `**/*.component.ts`)
- 8 instruction files covering: Angular, styling, Supabase, Leaflet, testing, specs, migrations, design

---

## Why Agent-Generated Code Goes Wrong

We ran into this with search. Root causes:

| Problem                                | What happened                            | Fix                                         |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Spec describes concepts, not structure | Agent guessed the component tree         | Write pseudo-HTML in the spec               |
| Actions aren't enumerated              | Agent skipped keyboard nav, empty states | Add an Actions table to every spec          |
| No file map                            | Agent put code in wrong directories      | List every file in the spec                 |
| No state contract                      | Agent invented extra signals/variables   | Define state table with types and defaults  |
| Long prose specs                       | Agent hallucinated from the middle       | Put the short description + hierarchy first |

---

## Workflow: Build a Feature with Agent Help

### Phase 1: Prepare (you do this)

1. Check `docs/glossary.md` for the element's canonical name
2. Create `docs/element-specs/[element].md` using the template in `element-spec-format.md`
3. Fill in: What It Is, hierarchy, actions, state, data, file map, acceptance criteria
4. Read `docs/design/constitution.md`, `docs/design.md`, and the relevant task-specific files in `docs/design/` to lock visual patterns before coding
5. Query Context7 MCP for external library usage details (Angular, Leaflet, Supabase, Tailwind)
6. If Context7 and project docs conflict, follow project docs first
7. If unsure about structure, ask the agent: _"Review this spec — what's missing?"_

### Phase 2: Plan (agent does this)

Prompt in chat:

```
/plan-before-build

Element: docs/element-specs/search-bar.md
```

Agent returns:

- Files to create/modify
- Component tree
- Service dependencies
- Questions about anything unclear

Review the plan. Answer questions. Adjust spec if needed.

### Phase 3: Build (agent does this)

Prompt in chat:

```
/implement-element

Element: docs/element-specs/search-bar.md
```

Agent creates all files following the spec.

### Phase 4: Verify (you + agent)

Option A — ask agent:

```
/review-against-spec

Element: docs/element-specs/search-bar.md
Files: [list the created files]
```

Option B — manual: run through `implementation-checklist.md`

### Phase 5: Fix (targeted prompts)

Don't say "fix the search." Be specific:

```
In search-bar.component.ts, Action #4 (ArrowDown moves highlight)
is not implemented. The keyboard event listener is missing.
Add it following the spec's keyboard contract.
```

---

## Tips

| Do                                            | Don't                                        |
| --------------------------------------------- | -------------------------------------------- |
| Add the element spec file to the chat context | Describe the feature verbally                |
| Ask for a plan before code                    | Ask for "the whole thing" at once            |
| Fix one issue per prompt                      | Paste the whole component and say "fix this" |
| Reference specific Action # or State variable | Say "make it work properly"                  |
| Keep specs updated when requirements change   | Let code and spec drift apart                |

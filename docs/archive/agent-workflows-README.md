# Agent Workflows & Instructions

> **Source of truth has moved to `.github/`.**
> Custom agents, prompts, skills, instructions, and hooks now live in `.github/` where VS Code Copilot auto-discovers them. This folder retains the original design rationale and is linked from the skills as reference material.

## New Structure (in `.github/`)

| Location                                 | What                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| `AGENTS.md` (root + nested)              | Workspace-level instructions, loaded automatically         |
| `.github/instructions/*.instructions.md` | File-pattern–scoped coding conventions                     |
| `.github/agents/*.agent.md`              | Custom agents: planner, implementer, reviewer, spec-writer |
| `.github/prompts/*.prompt.md`            | Slash-command prompts (5 total)                            |
| `.github/skills/*/SKILL.md`              | Reusable skills: implement-from-spec, write-element-spec   |
| `.github/hooks/post-edit.json`           | Auto-format hook (prettier)                                |

## Quick Start

1. Write or review the element spec: `docs/element-specs/[element].md`
2. Ask agent to **plan first**: use `/plan-before-build` prompt
3. Review the plan, then **implement**: use `/implement-element` prompt
4. Verify: use `/review-against-spec` prompt
5. Or invoke a custom agent directly: `@planner`, `@implementer`, `@reviewer`, `@spec-writer`

## Original Design Rationale

These files document _why_ we use structured specs and agent workflows:

| File                                                       | Purpose                                |
| ---------------------------------------------------------- | -------------------------------------- |
| [element-spec-format.md](element-spec-format.md)           | Template rationale for element specs   |
| [implementation-checklist.md](implementation-checklist.md) | Post-generation verification checklist |

## Core Principle

**Agents implement what they're told, not what you imagine.**

Every UI element gets a structured spec in `docs/element-specs/` before agent implementation. The spec is concrete, structured, and testable. The agent reads the spec and implements exactly that.

---

## Detailed Workflow Guide

The following sections were originally in `how-to-use-agents.md` and are preserved here as the single reference.

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
4. Read `docs/design/constitution.md` and `docs/design.md`, then load design files in this order: `docs/design/tokens.md` → `docs/design/layout.md` → `docs/design/motion.md` → task-specific design docs
5. Check `apps/web/src/styles.scss` for shared layout primitives before creating new panel or row shells
6. Query Context7 MCP for external library usage details (Angular, Leaflet, Supabase, Tailwind)
7. If Context7 and project docs conflict, follow project docs first
8. If unsure about structure, ask the agent: _"Review this spec — what's missing?"_

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

Implementation rule: agents should prefer existing layout primitives (`.ui-container`, `.ui-item`, `.ui-item-media`, `.ui-item-label`, `.ui-spacer`) before introducing new geometry classes.

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

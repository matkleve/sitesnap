---
agent: reviewer
tools: [read, search]
description: "Review an implemented element against its spec, reporting matches and deviations."
---

You are reviewing an implemented UI element against its spec in Sitesnap.

## Instructions

1. Open the element spec from `docs/element-specs/`
2. Open each file listed in the spec's **File Map**
3. Check every item below in order:

### Structure

- [ ] All files from File Map exist
- [ ] Component hierarchy matches the pseudo-HTML (tag nesting, parent/child)
- [ ] Standalone components (no NgModules)
- [ ] Files are in correct directories per project conventions

### Behavior

- [ ] Every row in the Actions table is implemented
- [ ] Every "Links To" / "Triggers" column works correctly
- [ ] Trigger conditions (appears when, opens when) are correct

### Data

- [ ] Correct Supabase tables/queries are used (match Data section)
- [ ] TypeScript types match generated schema, no `any`
- [ ] No hardcoded dummy data

### State

- [ ] All state variables from the spec exist with correct types
- [ ] Default values match the spec
- [ ] No extra state variables invented by the agent

### UI

- [ ] Design tokens used (--color-clay, --color-bg-base, etc.)
- [ ] Loading / error / empty states present
- [ ] Tap targets ≥48px mobile, ≥44px desktop
- [ ] Accessibility attributes (role, aria-\*) as specified

## Report Format

For each check:

- ✅ Matches spec
- ❌ Missing or wrong → state what's wrong and the specific fix
- ⚠️ Works but deviates from spec → explain deviation

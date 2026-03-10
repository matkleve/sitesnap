# Implementation Checklist

Run through this after every agent-generated feature. Compare against the element spec.

## Structure

- [ ] All files from the File Map exist
- [ ] Component hierarchy matches the pseudo-HTML (correct nesting)
- [ ] All components are standalone (no NgModules)
- [ ] Files follow naming convention: `kebab-case.component.ts`
- [ ] Files are in correct directories per project structure
- [ ] Design pattern source was reviewed (relevant element spec and design docs)

## Behavior

- [ ] Every Action table row is implemented
- [ ] Every "Triggers" navigation/event works
- [ ] Trigger conditions are correct (appears when, opens when)
- [ ] Keyboard interactions work as specified
- [ ] Touch targets ≥48px on mobile

## Data

- [ ] Correct Supabase tables/queries match the Data section
- [ ] TypeScript types come from generated schema (no `any`)
- [ ] No hardcoded dummy data left behind
- [ ] Service abstractions used (not direct Supabase calls from components)

## State

- [ ] All State table variables exist with correct types and defaults
- [ ] No extra state variables invented by the agent
- [ ] Signals used where specified

## UI & Design

- [ ] Design tokens used (`--color-clay`, `--color-bg-base`, etc.)
- [ ] Loading state renders correctly
- [ ] Error state renders correctly
- [ ] Empty state renders correctly with recovery action
- [ ] Ghost buttons for secondary actions, filled for primary CTA
- [ ] Hover-to-reveal for card actions (Quiet Actions principle)

## Accessibility

- [ ] ARIA roles match spec (`role="listbox"`, etc.)
- [ ] `aria-label` / `aria-describedby` where specified
- [ ] Focus management works (autofocus, trap, restore)
- [ ] Screen reader announces state changes

## Integration

- [ ] Component imported in parent per Wiring section
- [ ] Route added (if applicable)
- [ ] `ng build` passes with no errors
- [ ] No console errors at runtime

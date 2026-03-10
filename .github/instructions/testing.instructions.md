---
name: "Testing"
description: "Use when writing or editing unit tests, spec files, or test utilities."
applyTo: "**/*.spec.ts"
---

# Testing Conventions

- **Framework**: Vitest + jsdom
- Test files are co-located with source: `component.spec.ts` next to `component.ts`
- No hardcoded dummy data — use realistic values or factory helpers
- Use `describe`/`it` blocks with descriptive test names

## Patterns

- Mock services with `vi.fn()` and `vi.spyOn()`
- Test component behavior, not implementation details
- Include edge cases: empty data, error responses, loading states
- Test keyboard interactions where specified in element specs

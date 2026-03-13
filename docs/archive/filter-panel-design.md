# Feldpost – Component: Filter Panel

## 5.2 Filter Panel

### Filter Panel Accordion Structure

```mermaid
flowchart TD
    subgraph FilterPanel["Filter Panel — Grouped Accordion"]
        direction TB
        AFS["Applied Filters Summary\nChip row at top — always visible\nEach chip has × to remove"]
        AFS --> TR["1. Time Range\nDual date picker (from / to)\nPresets: Last 7d · 30d · 1y"]
        TR --> PR["2. Project\nMulti-select checkboxes + search\nMax 5 visible, scroll for more"]
        PR --> MD["3. Metadata\nKey/value pair builder\nKey dropdown autocomplete\nValue autocomplete per key"]
        MD --> MX["4. Max Distance\nRadio: 25m · 50m · 100m · 250m · Custom\nCustom → number input in meters"]
    end

    subgraph FilterLogic["Filter Combination Logic"]
        direction LR
        AND1["Time Range"] --- ANDOP1((AND))
        AND2["Project A OR B"] --- ANDOP1
        AND3["Metadata key=val"] --- ANDOP1
        AND4["Max Distance"] --- ANDOP1
        ANDOP1 --- RESULT["Filtered Result Set"]
    end
```

The filter panel is a grouped accordion. Each group has a header with a collapse chevron and a live "active count" badge that shows how many values are currently selected.

Groups (in order):

1. **Time range** — dual date picker (from / to). "Last 7 days", "Last 30 days", "Last year" quick presets.
2. **Project** — multi-select checkboxes with search input. Max 5 visible; scroll for more.
3. **Metadata** — key/value pair builder. Select a key from a dropdown (autocompletes from org keys), enter a value (autocompletes from existing values for that key).
4. **Max distance** — radio buttons: 25m / 50m / 100m / 250m / Custom. Custom shows a number input in meters.
5. **Applied filters summary** — a compact chip row at the top of the filter panel showing all active constraints. Each chip has a ✕ to remove it inline. This row also appears as a strip above the map search bar (always visible, even when the filter panel is closed).

Filter panel animation: slides in from the top-right (desktop) or bottom (mobile) using `transform: translateY(-100%)` → `translateY(0)` with `transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1)`.

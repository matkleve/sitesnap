# Known Bugs

## BUG-001: Address formatting — house number separated from street name

- **Date reported:** 2026-03-04
- **Severity:** Low (cosmetic)
- **Component:** Search / Address resolver (Nominatim geocoding result display)
- **Steps to reproduce:**
  1. Type "Fahrafeld 4" in the search bar.
  2. Observe the geocoding suggestion in the dropdown.
- **Expected:** `Fahrafeld 4, 3071 Austria` (or similar with house number next to street)
- **Actual:** `4, 3071 Fahrafeld Austria` — the house number "4" is split from "Fahrafeld" and placed at the start, making the address hard to read.
- **Screenshot:**  
  ![bug-001](../assets/bug-001-address-format.png) _(attach if available)_
- **Likely cause:** The display template assembles address parts (house_number, postcode, city/village, country) without keeping the street/locality and house number together.
- **Status:** Open

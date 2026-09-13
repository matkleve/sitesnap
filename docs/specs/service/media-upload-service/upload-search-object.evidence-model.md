# Upload search object — evidence, derivation, and the flat view

> **Parent:** [upload-search-object.md](./upload-search-object.md)
> **Siblings:** [layer packages](./upload-search-object.layer-map.md) · [country derivation](./upload-search-object.country-derivation.md)

One Search Object serves four jobs, and they want different content:

| Job | Needs |
| --- | --- |
| The **query** sent to the geocoder or the DB lookup | As complete as possible — a derived city helps it |
| The **grouping key** (which files share one geocode) | Stable, and never a value that could have been invented |
| The **label** in the panel | The most specific thing actually known, and where it came from |
| The **record of what the path said**, so a tray can ask | Literal, per folder level, several values per field allowed |

Reading all four off one set of flat fields is why a value's meaning was ambiguous: `city = Linz` may be
a folder name the user typed or a postcode expansion, and nothing said which.

## The three layers

| Layer | What it holds | Rules |
| --- | --- | --- |
| **Evidence** (`origin: 'path'`) | Every value read from a path segment: field, value, folder level (`0` = filename), source, confidence | Literal. Never invented, never overwritten, several values per field allowed |
| **Derivation** (`origin: 'derived'`) | A value computed from evidence by a **named rule**, carrying `rule` and `from` | Fills gaps only. May never replace path evidence for the same field |
| **Flat view** | `country`…`door` on `UploadSearchObject` | Computed from the two layers above by the precedence below — a projection, not a separate truth |

Named derivation rules today: `postcode→city` (`at-plz.json`), `place→country`
([country derivation](./upload-search-object.country-derivation.md)). A rule that cannot be named
is not a derivation — it is a guess, and guesses are not written.

## Vocabulary: area vs address

| Group | Fields | Why the name |
| --- | --- | --- |
| **Area** | `country`, `state`, `postcode`, `city` | The nested administrative places that *contain* the address. Formerly "admin fields" — the map is `areaEvidence` |
| **Address** | `street`, `houseNumber`, `staircase`, `door` | The address *within* that area. Resolved as [layer packages](./upload-search-object.layer-map.md) |

The tray kind string `admin_level_conflict` and its translation key
`upload.resolver.question.adminLevelConflict` keep their old spelling: they are seeded data, and
renaming them is a translation migration rather than a model change.

## Precedence for the flat view

| Field group | Rule |
| --- | --- |
| Area | Lowest level (most specific folder) wins among path evidence; a derived value only fills a field with **no** path evidence; two incompatible values ⇒ write one and record `areaConflicts` |
| Address | The chosen or merged layer package only |

## Strong and weak evidence

Any leftover word becomes a `street` candidate at confidence 0.5, so "is this a street?" must be
answered before the value is allowed to matter.

| Street evidence is **strong** when | Example |
| --- | --- |
| The token carries a street suffix or keyword | `Annenstraße`, `Kremser Straße`, `Getreidegasse` |
| It ends in a German street abbreviation (`str`, `str.`) | `Wilhelminenstr` |
| A house number stands beside it in the same segment, and the segment is not noise | `Am Graben 12` |

Everything else is **weak**: it stays in the evidence layer, and it

- **MUST NOT** form an address layer package (so `Baustelle Nord` never competes with a real street),
- **MUST NOT** appear as the flat `street`,
- **MUST NOT** enter the grouping key.

When comparing street values (package conflicts, grouping), fold the abbreviations first:
`str`/`str.` ≡ `straße`, `g.` ≡ `gasse`, `pl.` ≡ `platz`. `Wilhelminenstr 141` and
`Wilhelminenstraße 141` are therefore one address, not a question.

## The address side is all or nothing

`houseNumber`, `staircase` and `door` describe a position **on a street**. Without a street they are
not an address, so:

> A flat Search Object with no `street` **MUST NOT** carry `houseNumber`, `staircase` or `door`, and
> the grouping key **MUST NOT** contain them either.

This is what stops `Baustelle Süd/Woche 12` from reporting house number 12 and grouping itself with
every other stray `12` in the batch. Period words (`Woche`, `KW`, `Tag`, `Monat`, `Jahr`) are noise
segments, so they never reach the promotion rule above.

## Grouping key

Built from the flat view, and therefore only from values that survived the rules above. A key may
contain a derived value — every rule we have is a deterministic lookup from path evidence, so it
cannot differ between two files of the same folder — but never a weak street, never a house number
without a street, and never a fuzzy substitution
([confidence thresholds](./upload-search-object.md#confidence-thresholds)).

## Implementation map

| Symbol | File |
| --- | --- |
| `AreaFieldKey`, `ValueOrigin`, `FieldLevelEntry.origin` | `apps/web/src/app/core/upload/address-resolution/upload-area-evidence.types.ts` |
| `detectAreaConflicts`, `collapseAreaFlatFields` | `apps/web/src/app/core/location-path-parser/upload-area-evidence.helpers.ts` |
| Evidence writes, flat projection, grouping key | `apps/web/src/app/core/location-path-parser/upload-search-object.builder.ts` |
| Strong / weak street evidence | `apps/web/src/app/core/location-path-parser/path-token-classifier.ts` |
| Package formation and folding | `apps/web/src/app/core/location-path-parser/upload-search-object.layer-map.ts` |

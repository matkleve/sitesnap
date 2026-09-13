# Upload search object — country derived from the place

> **Parent:** [upload-search-object.md](./upload-search-object.md)

Folder paths rarely name the country. `Mödling/Wilhelminenstraße 141/…` is an Austrian address that
says so nowhere. A classifier that needs `country` before it will look at a gazetteer therefore reads
`Mödling` as street text, and the Search Object never reaches a geocodable branch.

The country is **derived from the place**, not required before it.

## Rule

| Step | Requirement |
| --- | --- |
| 1 | Pass 1 step 4 (`COUNTRY_NAMES`) still wins. A country read from the path is `countryProvenance: 'parsed'` and **MUST NOT** be replaced by derivation. |
| 2 | A place is matched by **exact** normalized name/alias against the country-carrying city registry (each row states its own `country`) and, when the current country is unset or `AT`, against the AT state and municipality gazetteers (a hit there implies `AT`). |
| 3 | A registry row whose country **disagrees** with an already-parsed country is not a place here: it is skipped, and the token falls through to street text as before. |
| 4 | When `country` is unset and every exact hit agrees on one country, that country is written, marked `countryProvenance: 'derived'`, and emitted as a `country` token **in token order** so pass 2 can classify a postcode in the same segment. |
| 5 | When the exact hits **disagree** on the country, **no country is derived** — but every hit is still written: identical values collapse to one, differing ones land as two entries at that level, where `areaConflicts` opens the tray that asks. Ambiguity is surfaced, never guessed. |
| 6 | **Fuzzy** matching stays gated on `country === 'AT'`. Derivation uses exact matches only — a fuzzy hit in one country's gazetteer is not evidence of that country. |

Both `state` and `city` may come out of one token (`Salzburg`); the derived country is written once.

## Not the mechanism

An organisation's country is **not** the input. An org may work in DE *and* AT, so its home country
cannot decide a path's country. Restricting a batch to a country list is an optional **narrowing**
filter on top of this rule, never the source of it.

## Downstream

`countryProvenance` is advisory: it gates no branch. It exists so a tray can say *why* a country is
set, and so a later narrowing filter can tell an asserted country from an inferred one — that filter
adds its own value when it lands; today the only two are `parsed` and `derived`.

Implementation:
[`path-token-classifier.ts`](../../../../apps/web/src/app/core/location-path-parser/path-token-classifier.ts) ·
[`location-path-parser.util.ts`](../../../../apps/web/src/app/core/location-path-parser/location-path-parser.util.ts)

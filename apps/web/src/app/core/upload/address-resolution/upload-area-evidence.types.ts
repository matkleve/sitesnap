/**
 * Area evidence: which area field each folder level asserted, and whether a value was read from the
 * path or derived from another by a named rule.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */

/** The nested places that *contain* an address, as opposed to the address within them. */
export type AreaFieldKey = 'country' | 'state' | 'city' | 'postcode';

/**
 * Where a value came from.
 * - `path` — read literally from a folder or file name.
 * - `derived` — computed from other evidence by a named rule (`postcode→city`, `place→country`).
 *   A value with no nameable rule is a guess, and guesses are not written.
 */
export type ValueOrigin = 'path' | 'derived';

export interface FieldLevelEntry {
  /** 0 = filename; 1 = direct parent folder; higher = ancestors. */
  level: number;
  value: string;
  source: 'folder' | 'filename';
  field: AreaFieldKey;
  /** Defaults to `path` when absent — entries written before this field existed are path evidence. */
  origin?: ValueOrigin;
  /** Only on a derived entry: the rule that produced it, e.g. `postcode→city`. */
  rule?: string;
  /** Only on a derived entry: the value it was derived from, e.g. the postcode `4020`. */
  derivedFrom?: string;
}

export interface AreaConflict {
  /** Primary field shown in tray copy. */
  field: AreaFieldKey;
  /** At least two entries with incompatible values (may span fields for gazetteer checks). */
  entries: FieldLevelEntry[];
}

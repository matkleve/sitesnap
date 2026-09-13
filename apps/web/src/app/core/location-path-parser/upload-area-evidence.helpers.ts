/**
 * Admin level-map conflict detection and flat-field collapse.
 * @see docs/specs/service/media-upload-service/upload-search-object.md#area-evidence
 */

import type { GemeindeRecord, PlzMap } from './local-geo-data.adapter';
import type {
  AreaFieldKey,
  AreaConflict,
  FieldLevelEntry,
} from '../upload/address-resolution/upload-area-evidence.types';

const ADMIN_FIELDS: AreaFieldKey[] = ['country', 'state', 'city', 'postcode'];

export function normalizeAdminValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function expandPostcodeCities(postcode: string, postcodeMap?: PlzMap): string[] {
  if (!postcodeMap) {
    return [postcode];
  }
  return postcodeMap[postcode.trim()] ?? [];
}

function expandedValuesForField(
  field: AreaFieldKey,
  value: string,
  postcodeMap?: PlzMap,
): string[] {
  if (field === 'postcode') {
    const cities = expandPostcodeCities(value, postcodeMap);
    return cities.length ? cities : [value];
  }
  return [value];
}

function valuesAreEquivalent(
  fieldA: AreaFieldKey,
  valueA: string,
  fieldB: AreaFieldKey,
  valueB: string,
  postcodeMap?: PlzMap,
): boolean {
  if (normalizeAdminValue(valueA) === normalizeAdminValue(valueB)) {
    return true;
  }

  const expansionsA: string[] = [];
  const expansionsB: string[] = [];

  if (fieldA === 'postcode' || fieldA === 'city') {
    expansionsA.push(
      ...(fieldA === 'postcode'
        ? expandedValuesForField('postcode', valueA, postcodeMap)
        : [valueA]),
    );
  }
  if (fieldB === 'postcode' || fieldB === 'city') {
    expansionsB.push(
      ...(fieldB === 'postcode'
        ? expandedValuesForField('postcode', valueB, postcodeMap)
        : [valueB]),
    );
  }

  if (!expansionsA.length) {
    expansionsA.push(valueA);
  }
  if (!expansionsB.length) {
    expansionsB.push(valueB);
  }

  for (const a of expansionsA) {
    for (const b of expansionsB) {
      if (normalizeAdminValue(a) === normalizeAdminValue(b)) {
        return true;
      }
    }
  }

  return false;
}

function isSalzburgSameNamePair(city: string, state: string): boolean {
  return normalizeAdminValue(city) === normalizeAdminValue(state);
}

function cityBelongsToState(
  city: string,
  state: string,
  municipalities: GemeindeRecord[],
): boolean {
  if (isSalzburgSameNamePair(city, state)) {
    return true;
  }
  const normCity = normalizeAdminValue(city);
  const municipality = municipalities.find((m) => normalizeAdminValue(m.n) === normCity);
  if (!municipality) {
    return true;
  }
  return normalizeAdminValue(municipality.b) === normalizeAdminValue(state);
}

function uniqueEntries(entries: FieldLevelEntry[]): FieldLevelEntry[] {
  const seen = new Set<string>();
  const result: FieldLevelEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.field}|${entry.level}|${entry.source}|${normalizeAdminValue(entry.value)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function entriesHaveDistinctValues(
  entries: FieldLevelEntry[],
  field: AreaFieldKey,
  postcodeMap?: PlzMap,
): boolean {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (!valuesAreEquivalent(field, entries[i].value, field, entries[j].value, postcodeMap)) {
        return true;
      }
    }
  }
  return false;
}

export function collapseAreaFlatFields(
  fields: {
    country: string | null;
    state: string | null;
    postcode: string | null;
    city: string | null;
  },
  areaEvidence: Partial<Record<AreaFieldKey, FieldLevelEntry[]>>,
): void {
  for (const field of ADMIN_FIELDS) {
    const entries = areaEvidence[field];
    if (!entries?.length) {
      continue;
    }
    const winner = [...entries].sort((a, b) => a.level - b.level)[0];
    fields[field] = winner.value;
  }
}

export function buildAdminConflictSignature(conflicts: AreaConflict[]): string {
  return conflicts
    .map(
      (c) =>
        `${c.field}|${[...new Set(c.entries.map((e) => normalizeAdminValue(e.value)))].sort().join(',')}`,
    )
    .sort()
    .join(';');
}

export function buildAdminConflictQueryKey(signature: string): string {
  return `adminConflict|${signature}`;
}

export function detectAreaConflicts(
  areaEvidence: Partial<Record<AreaFieldKey, FieldLevelEntry[]>>,
  options: {
    municipalities: GemeindeRecord[];
    postcodeMap?: PlzMap;
    country?: string | null;
  },
): AreaConflict[] {
  const conflicts: AreaConflict[] = [];
  const useAtGazetteer = (options.country ?? 'AT').toUpperCase() === 'AT';

  for (const field of ADMIN_FIELDS) {
    const entries = areaEvidence[field];
    if (!entries || entries.length < 2) {
      continue;
    }
    if (entriesHaveDistinctValues(entries, field, options.postcodeMap)) {
      conflicts.push({ field, entries: uniqueEntries(entries) });
    }
  }

  const cityEntries = areaEvidence.city ?? [];
  const stateEntries = areaEvidence.state ?? [];
  if (useAtGazetteer && cityEntries.length && stateEntries.length) {
    const incompatible: FieldLevelEntry[] = [];
    for (const cityEntry of cityEntries) {
      for (const stateEntry of stateEntries) {
        if (
          !cityBelongsToState(cityEntry.value, stateEntry.value, options.municipalities)
        ) {
          incompatible.push(cityEntry, stateEntry);
        }
      }
    }
    if (incompatible.length) {
      const merged = uniqueEntries([
        ...(conflicts.find((c) => c.field === 'city')?.entries ?? []),
        ...incompatible,
      ]);
      if (merged.length >= 2) {
        const existing = conflicts.find((c) => c.field === 'city');
        if (existing) {
          existing.entries = merged;
        } else {
          conflicts.push({ field: 'city', entries: merged });
        }
      }
    }
  }

  // Pass 3: postcode-city cross-check (AT only).
  // If a postcode expands to cities via PLZ map, and the assigned city is NOT
  // among them, that's a contradiction (e.g. postcode 1200 = Wien, but city = St. Pölten).
  const postcodeEntries = areaEvidence.postcode ?? [];
  if (useAtGazetteer && cityEntries.length && postcodeEntries.length && options.postcodeMap) {
    const incompatiblePc: FieldLevelEntry[] = [];
    for (const pcEntry of postcodeEntries) {
      const expandedCities = expandPostcodeCities(pcEntry.value, options.postcodeMap);
      if (!expandedCities.length) {
        continue;
      }
      const normalizedExpanded = expandedCities.map(normalizeAdminValue);
      for (const cityEntry of cityEntries) {
        const normCity = normalizeAdminValue(cityEntry.value);
        if (!normalizedExpanded.includes(normCity)) {
          incompatiblePc.push(cityEntry);
          for (const expandedCity of expandedCities) {
            incompatiblePc.push({
              level: pcEntry.level,
              value: expandedCity,
              source: pcEntry.source,
              field: 'city',
            });
          }
        }
      }
    }
    if (incompatiblePc.length) {
      const merged = uniqueEntries([
        ...(conflicts.find((c) => c.field === 'city')?.entries ?? []),
        ...incompatiblePc,
      ]);
      if (merged.length >= 2) {
        const existing = conflicts.find((c) => c.field === 'city');
        if (existing) {
          existing.entries = merged;
        } else {
          conflicts.push({ field: 'city', entries: merged });
        }
      }
    }
  }

  return conflicts.filter((c) => c.entries.length >= 2);
}

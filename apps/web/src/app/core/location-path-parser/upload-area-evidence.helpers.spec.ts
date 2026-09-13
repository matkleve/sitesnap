import { describe, expect, it } from 'vitest';
import {
  buildAdminConflictQueryKey,
  buildAdminConflictSignature,
  collapseAreaFlatFields,
  detectAreaConflicts,
  normalizeAdminValue,
} from './upload-area-evidence.helpers';

const municipalities = [
  { n: 'Wien', b: 'Wien', a: [] },
  { n: 'Innsbruck', b: 'Tirol', a: [] },
  { n: 'Salzburg', b: 'Salzburg', a: [] },
];

const postcodeMap = {
  '1090': ['Wien'],
  '1200': ['Wien'],
};

describe('detectAreaConflicts', () => {
  it('does not conflict when postcode expands to same city', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'Wien', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1090', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('conflicts when city is not in declared state (Wien + Innsbruck)', () => {
    const conflicts = detectAreaConflicts(
      {
        state: [{ level: 2, value: 'Wien', source: 'folder', field: 'state' }],
        city: [{ level: 1, value: 'Innsbruck', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].entries.some((e) => normalizeAdminValue(e.value) === 'innsbruck')).toBe(
      true,
    );
  });

  it('allows Salzburg state and city with same name', () => {
    const conflicts = detectAreaConflicts(
      {
        state: [{ level: 2, value: 'Salzburg', source: 'folder', field: 'state' }],
        city: [{ level: 1, value: 'Salzburg', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('conflicts when same field has different values at different levels', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [
          { level: 2, value: 'Wien', source: 'folder', field: 'city' },
          { level: 1, value: 'Graz', source: 'folder', field: 'city' },
        ],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('city');
    expect(conflicts[0].entries).toHaveLength(2);
  });

  it('skips gazetteer check outside AT (value compare only)', () => {
    const conflicts = detectAreaConflicts(
      {
        state: [{ level: 2, value: 'Bayern', source: 'folder', field: 'state' }],
        city: [{ level: 1, value: 'München', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'DE' },
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe('collapseAreaFlatFields', () => {
  it('picks the lowest level entry per admin field', () => {
    const fields = {
      country: null as string | null,
      state: null as string | null,
      postcode: null as string | null,
      city: null as string | null,
    };
    collapseAreaFlatFields(fields, {
      city: [
        { level: 2, value: 'Wien', source: 'folder', field: 'city' },
        { level: 1, value: '1090', source: 'folder', field: 'city' },
      ],
    });
    expect(fields.city).toBe('1090');
  });
});

describe('buildAdminConflictSignature', () => {
  it('builds a stable dedup signature and query key', () => {
    const conflicts = detectAreaConflicts(
      {
        state: [{ level: 2, value: 'Wien', source: 'folder', field: 'state' }],
        city: [{ level: 1, value: 'Innsbruck', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    const signature = buildAdminConflictSignature(conflicts);
    expect(signature).toContain('city|');
    expect(buildAdminConflictQueryKey(signature)).toBe(`adminConflict|${signature}`);
  });

  it('produces the same signature regardless of conflict entry order', () => {
    const mapA = {
      state: [{ level: 2, value: 'Wien', source: 'folder' as const, field: 'state' as const }],
      city: [{ level: 1, value: 'Innsbruck', source: 'folder' as const, field: 'city' as const }],
    };
    const mapB = {
      city: [{ level: 1, value: 'Innsbruck', source: 'folder' as const, field: 'city' as const }],
      state: [{ level: 2, value: 'Wien', source: 'folder' as const, field: 'state' as const }],
    };
    const sigA = buildAdminConflictSignature(
      detectAreaConflicts(mapA, { municipalities, postcodeMap, country: 'AT' }),
    );
    const sigB = buildAdminConflictSignature(
      detectAreaConflicts(mapB, { municipalities, postcodeMap, country: 'AT' }),
    );
    expect(sigA).toBe(sigB);
  });
});

describe('normalizeAdminValue', () => {
  it('strips diacritics and normalizes whitespace', () => {
    expect(normalizeAdminValue('  Wörgl  ')).toBe('worgl');
    expect(normalizeAdminValue('Sankt Pölten')).toBe('sankt polten');
  });
});

describe('detectAreaConflicts — postcode-city cross-validation', () => {
  it('conflicts when postcode 1200 maps to Wien but city is St. Pölten', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'St. Pölten', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].field).toBe('city');
    const values = conflicts[0].entries.map((e) => normalizeAdminValue(e.value));
    expect(values).toContain('wien');
    expect(values.some((v) => v.includes('polten'))).toBe(true);
  });

  it('does not conflict when postcode 1200 and city Wien agree', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'Wien', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('skips postcode-city check when postcode is unknown in PLZ map', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'St. Pölten', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '9999', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('skips postcode-city check for non-AT country', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'Hamburg', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'DE' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('skips postcode-city check when no postcodeMap provided', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'St. Pölten', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('postcode-city conflict merges with existing per-field city conflict', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [
          { level: 3, value: 'Graz', source: 'folder', field: 'city' },
          { level: 2, value: 'St. Pölten', source: 'folder', field: 'city' },
        ],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('city');
    const values = conflicts[0].entries.map((e) => normalizeAdminValue(e.value));
    expect(values).toContain('graz');
    expect(values.some((v) => v.includes('polten'))).toBe(true);
    expect(values).toContain('wien');
  });

  it('postcode-city conflict includes synthetic entry from PLZ expansion', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'Linz', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1090', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(1);
    const entries = conflicts[0].entries;
    expect(entries.some((e) => e.value === 'Wien')).toBe(true);
    expect(entries.some((e) => e.value === 'Linz')).toBe(true);
  });

  it('does not conflict when only postcode present (no city entries)', () => {
    const conflicts = detectAreaConflicts(
      {
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('does not conflict when only city present (no postcode entries)', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 1, value: 'Wien', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('postcode-city check with case-insensitive city name match', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'wien', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1200', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('postcode-city check with diacritics in city name', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [{ level: 2, value: 'WIEN', source: 'folder', field: 'city' }],
        postcode: [{ level: 1, value: '1090', source: 'folder', field: 'postcode' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe('detectAreaConflicts — edge cases', () => {
  it('conflicts on same field for DE even without gazetteer', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [
          { level: 2, value: 'Berlin', source: 'folder', field: 'city' },
          { level: 1, value: 'Hamburg', source: 'folder', field: 'city' },
        ],
      },
      { municipalities, postcodeMap, country: 'DE' },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe('city');
  });

  it('accepts Wien city inside Wien state via gazetteer', () => {
    const conflicts = detectAreaConflicts(
      {
        state: [{ level: 2, value: 'Wien', source: 'folder', field: 'state' }],
        city: [{ level: 1, value: 'Wien', source: 'folder', field: 'city' }],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts).toHaveLength(0);
  });

  it('deduplicates repeated level entries in conflict output', () => {
    const conflicts = detectAreaConflicts(
      {
        city: [
          { level: 2, value: 'Wien', source: 'folder', field: 'city' },
          { level: 2, value: 'Wien', source: 'folder', field: 'city' },
          { level: 1, value: 'Graz', source: 'folder', field: 'city' },
        ],
      },
      { municipalities, postcodeMap, country: 'AT' },
    );
    expect(conflicts[0].entries).toHaveLength(2);
  });
});

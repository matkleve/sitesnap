import { describe, expect, it } from 'vitest';
import { buildSearchObjectFromRelativePath } from '../../location-path-parser/upload-search-object.builder';
import {
  adminLevelCandidateId,
  adminLevelManualCandidateId,
  applyAdminLevelSelectionsToSearchObject,
  buildAdminConflictCandidates,
  parseAdminLevelCandidateId,
} from './upload-location-area-choice.util';
import type { UploadSearchObject } from '../address-resolution/upload-address-resolution.types';

const municipalities = [
  { n: 'Wien', b: 'Wien', a: [] },
  { n: 'Innsbruck', b: 'Tirol', a: [] },
];

const postcodeMap = { '1090': ['Wien'] };

function baseSearchObject(overrides: Partial<UploadSearchObject> = {}): UploadSearchObject {
  return {
    country: 'AT',
    state: 'Wien',
    postcode: null,
    city: 'Innsbruck',
    street: null,
    houseNumber: null,
    staircase: null,
    door: null,
    project: null,
    sources: [],
    sourceDeviations: [],
    postcodeCandidates: [],
    uncertainFields: [],
    groupingKey: 'at|wien||innsbruck||',
    relativePath: 'Wien/Innsbruck/photo.jpg',
    fileName: 'photo.jpg',
    areaEvidence: {
      state: [{ level: 2, value: 'Wien', source: 'folder', field: 'state' }],
      city: [{ level: 1, value: 'Innsbruck', source: 'folder', field: 'city' }],
    },
    areaConflicts: [
      {
        field: 'city',
        entries: [
          { level: 2, value: 'Wien', source: 'folder', field: 'state' },
          { level: 1, value: 'Innsbruck', source: 'folder', field: 'city' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('upload-location-area-choice.util', () => {
  it('round-trips admin level candidate ids', () => {
    const entry = { level: 2, value: 'Wien', source: 'folder' as const, field: 'state' as const };
    const id = adminLevelCandidateId(entry);
    expect(parseAdminLevelCandidateId(id)).toEqual({ field: 'state', value: 'Wien' });
  });

  it('builds tray candidates from conflicts without duplicates', () => {
    const conflicts = baseSearchObject().areaConflicts!;
    const candidates = buildAdminConflictCandidates(conflicts);
    const ids = candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(candidates.some((c) => c.addressLabel.includes('Level 1: Innsbruck'))).toBe(true);
    expect(candidates.some((c) => c.id.startsWith('admin-manual|'))).toBe(true);
  });

  it('clears conflicts when user picks a compatible city for Wien state', () => {
    const resolved = applyAdminLevelSelectionsToSearchObject(
      baseSearchObject(),
      { city: 'Wien' },
      { municipalities, postcodeMap },
    );
    expect(resolved.city).toBe('Wien');
    expect(resolved.areaConflicts).toHaveLength(0);
    expect(resolved.groupingKey).toContain('wien');
  });

  it('recomputes groupingKey after resolution', () => {
    const before = baseSearchObject().groupingKey;
    const resolved = applyAdminLevelSelectionsToSearchObject(
      baseSearchObject(),
      { city: 'Wien' },
      { municipalities, postcodeMap },
    );
    expect(resolved.groupingKey).not.toBe(before);
  });

  it('returns null for manual candidate ids', () => {
    expect(parseAdminLevelCandidateId(adminLevelManualCandidateId('city'))).toBeNull();
  });

  it('round-trips candidate ids with encoded special characters', () => {
    const entry = {
      level: 1,
      value: 'St. Pölten',
      source: 'folder' as const,
      field: 'city' as const,
    };
    const parsed = parseAdminLevelCandidateId(adminLevelCandidateId(entry));
    expect(parsed).toEqual({ field: 'city', value: 'St. Pölten' });
  });

  it('replaces prior level-map entries for the resolved field', () => {
    const resolved = applyAdminLevelSelectionsToSearchObject(
      baseSearchObject(),
      { city: 'Wien' },
      { municipalities, postcodeMap },
    );
    expect(resolved.areaEvidence?.city).toHaveLength(1);
    expect(resolved.areaEvidence?.city?.[0].value).toBe('Wien');
  });

  it('keeps conflict when resolved city still mismatches state', () => {
    const resolved = applyAdminLevelSelectionsToSearchObject(
      baseSearchObject(),
      { city: 'Innsbruck' },
      { municipalities, postcodeMap },
    );
    expect(resolved.areaConflicts?.length).toBeGreaterThan(0);
  });

  it('resolves when user picks matching state for Innsbruck city', () => {
    const resolved = applyAdminLevelSelectionsToSearchObject(
      baseSearchObject(),
      { state: 'Tirol' },
      { municipalities, postcodeMap },
    );
    expect(resolved.state).toBe('Tirol');
    expect(resolved.areaConflicts).toHaveLength(0);
  });

  it('resolves street path Wien/Innsbruck when user picks Tirol state', () => {
    const geo = {
      states: [
        { n: 'Wien', a: [] },
        { n: 'Tirol', a: [] },
      ],
      municipalities: [
        { n: 'Wien', b: 'Wien', a: [] },
        { n: 'Innsbruck', b: 'Tirol', a: [] },
      ],
      postcodeMap: { '6020': ['Innsbruck'] },
    };
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/Innsbruck/Hauptstraße 5/photo.jpg',
      'photo.jpg',
      geo,
    );
    expect(so.areaConflicts?.length).toBeGreaterThan(0);

    const resolvedWithTirol = applyAdminLevelSelectionsToSearchObject(
      so,
      { state: 'Tirol' },
      { municipalities: geo.municipalities, postcodeMap: geo.postcodeMap },
    );
    expect(resolvedWithTirol.areaConflicts?.length).toBeGreaterThan(0);

    const resolvedWithWienCity = applyAdminLevelSelectionsToSearchObject(
      so,
      { city: 'Wien' },
      { municipalities: geo.municipalities, postcodeMap: geo.postcodeMap },
    );
    expect(resolvedWithWienCity.areaConflicts).toHaveLength(0);
  });
});

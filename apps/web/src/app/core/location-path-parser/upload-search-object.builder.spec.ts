import { describe, expect, it } from 'vitest';
import {
  buildGroupingKey,
  buildSearchObjectFromRelativePath,
  isSearchObjectComplete,
} from './upload-search-object.builder';

const geo = {
  states: [{ n: 'Wien', a: ['vienna'] }],
  municipalities: [
    { n: 'Wien', b: 'Wien', a: ['vienna'] },
    { n: 'Graz', b: 'Steiermark', a: [] },
  ],
};

const geoWithInnsbruck = {
  states: [
    { n: 'Wien', a: ['vienna'] },
    { n: 'Tirol', a: [] },
  ],
  municipalities: [
    { n: 'Wien', b: 'Wien', a: ['vienna'] },
    { n: 'Innsbruck', b: 'Tirol', a: [] },
    { n: 'Graz', b: 'Steiermark', a: [] },
  ],
  postcodeMap: {
    '1090': ['Wien'],
  },
};

describe('buildSearchObjectFromRelativePath', () => {
  it('classifies country before postcode and street tokens', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/Neustiftgasse-43/Stiege-2/Rechnung.pdf',
      'Rechnung.pdf',
      geo,
    );
    expect(so.country).toBe('AT');
    expect(so.postcode).toBeNull();
    expect(so.groupingKey).toContain('neustiftgasse');
  });

  it('classifies house number after city in same segment when country unknown', () => {
    const so = buildSearchObjectFromRelativePath(
      'Neustiftgasse-43.pdf',
      'Neustiftgasse-43.pdf',
      geo,
    );
    expect(so.houseNumber).toBe('43');
    expect(so.postcode).toBeNull();
  });

  it('parses AT slash house/top from folder path (EX-09)', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/Neustiftgasse 25/14/photo.jpg',
      'photo.jpg',
      geo,
    );
    expect(so.houseNumber).toBe('25');
    expect(so.door).toBe('14');
    expect(so.staircase).toBeNull();
  });

  it('classifies AT postcode when country segment is present', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Neustiftgasse-43/photo.jpg',
      'photo.jpg',
      geo,
    );
    expect(so.country).toBe('AT');
    expect(so.postcode).toBe('1090');
  });

  it('filename street overrides folder city when both present', () => {
    const so = buildSearchObjectFromRelativePath(
      'Wien/AndereStrasse/Neustiftgasse-43.pdf',
      'Neustiftgasse-43.pdf',
      geo,
    );
    expect(so.street?.toLowerCase()).toContain('neustiftgasse');
    expect(so.houseNumber).toBe('43');
  });
});

describe('buildSearchObjectFromRelativePath — admin level map', () => {
  it('records admin fields per folder level', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Neustiftgasse-43/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.adminLevelMap?.city?.some((e) => e.value === 'Wien')).toBe(true);
    expect(so.adminLevelMap?.postcode?.some((e) => e.value === '1090')).toBe(true);
    const cityLevel = so.adminLevelMap?.city?.find((e) => e.value === 'Wien')?.level;
    const postcodeLevel = so.adminLevelMap?.postcode?.find((e) => e.value === '1090')?.level;
    expect(cityLevel).toBeGreaterThan(postcodeLevel!);
  });

  it('does not conflict when postcode expands to the same city', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.adminLevelConflicts ?? []).toHaveLength(0);
  });

  it('detects gazetteer conflict for Wien folder + Innsbruck subfolder', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/Innsbruck/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.adminLevelConflicts?.length).toBeGreaterThan(0);
    const values = so.adminLevelConflicts!.flatMap((c) => c.entries.map((e) => e.value));
    expect(values.some((v) => v.toLowerCase().includes('innsbruck'))).toBe(true);
  });

  it('collapses flat postcode to the most specific (lowest) folder level', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.postcode).toBe('1090');
    expect(so.city).toBe('Wien');
  });

  it('conflicts when two cities appear at different folder levels', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/Graz/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.adminLevelConflicts?.some((c) => c.field === 'city')).toBe(true);
  });

  it('records filename-derived admin tokens at level 0', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/photo.jpg',
      'Graz.jpg',
      geoWithInnsbruck,
    );
    const filenameCity = so.adminLevelMap?.city?.find((e) => e.source === 'filename');
    expect(filenameCity?.level).toBe(0);
    expect(filenameCity?.value).toBe('Graz');
  });

  it('includes country in adminLevelMap from AT segment', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/photo.jpg',
      'photo.jpg',
      geoWithInnsbruck,
    );
    expect(so.adminLevelMap?.country?.some((e) => e.value === 'AT')).toBe(true);
  });
});

describe('buildSearchObjectFromRelativePath — filename admin gate', () => {
  it('ignores a camera filename number instead of writing it as a postcode', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Währinger Straße 12/IMG_1274.jpg',
      'IMG_1274.jpg',
      geo,
    );

    expect(so.postcode).toBe('1090');
    expect(so.adminLevelMap?.postcode?.some((entry) => entry.value === '1274')).toBe(false);
    expect(so.adminLevelConflicts ?? []).toEqual([]);
  });

  it('keeps two camera files in one folder in the same group', () => {
    const first = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Währinger Straße 12/IMG_1274.jpg',
      'IMG_1274.jpg',
      geo,
    );
    const second = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Währinger Straße 12/IMG_1275.jpg',
      'IMG_1275.jpg',
      geo,
    );

    expect(first.groupingKey).toBe(second.groupingKey);
  });

  it('ignores admin tokens from a filename with no real street, however it is worded', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Wien/1090/Währinger Straße 12/Kopie von IMG_1274.jpg',
      'Kopie von IMG_1274.jpg',
      geo,
    );

    expect(so.postcode).toBe('1090');
  });

});

describe('buildSearchObjectFromRelativePath — filename admin gate, still allowed', () => {
  it('still accepts a postcode from a filename that carries a real street', () => {
    const so = buildSearchObjectFromRelativePath(
      'AT/Baustelle Nord/1090 Mühlenstraße 12.jpg',
      '1090 Mühlenstraße 12.jpg',
      geo,
    );

    expect(so.postcode).toBe('1090');
    expect(so.street).toContain('Mühlenstraße');
    expect(so.houseNumber).toBe('12');
  });

  it('keeps street-level fields from the filename untouched', () => {
    const so = buildSearchObjectFromRelativePath(
      'Baustelle Nord/Mühlenstraße 12.jpg',
      'Mühlenstraße 12.jpg',
      geo,
    );

    expect(so.sources.some((e) => e.field === 'street' && e.source === 'filename')).toBe(true);
    expect(so.houseNumber).toBe('12');
  });
});

describe('buildGroupingKey', () => {
  it('dedupes identical addresses', () => {
    const a = buildGroupingKey({
      country: 'AT',
      state: 'Wien',
      postcode: '1090',
      city: 'Wien',
      street: 'Neustiftgasse',
      houseNumber: '43',
      staircase: null,
      door: null,
      project: null,
    });
    const b = buildGroupingKey({
      country: 'AT',
      state: 'Wien',
      postcode: '1090',
      city: 'Wien',
      street: 'Neustiftgasse',
      houseNumber: '43',
      staircase: null,
      door: null,
      project: null,
    });
    expect(a).toBe(b);
  });

  it('excludes door and staircase from grouping key', () => {
    const base = buildGroupingKey({
      country: 'AT',
      state: null,
      postcode: null,
      city: 'Wien',
      street: 'Neustiftgasse',
      houseNumber: '25',
      staircase: null,
      door: null,
      project: null,
    });
    const withUnits = buildGroupingKey({
      country: 'AT',
      state: null,
      postcode: null,
      city: 'Wien',
      street: 'Neustiftgasse',
      houseNumber: '25',
      staircase: '4',
      door: '14',
      project: null,
    });
    expect(base).toBe(withUnits);
  });
});

describe('isSearchObjectComplete', () => {
  it('requires locality and street', () => {
    expect(
      isSearchObjectComplete({
        country: 'AT',
        state: null,
        postcode: null,
        city: null,
        street: 'Neustiftgasse',
        houseNumber: '43',
        staircase: null,
        door: null,
        project: null,
        sources: [],
        sourceDeviations: [],
        postcodeCandidates: [],
        uncertainFields: [],
        groupingKey: '',
        relativePath: '',
        fileName: '',
      }),
    ).toBe(false);

    expect(
      isSearchObjectComplete({
        country: 'AT',
        state: null,
        postcode: '1090',
        city: 'Wien',
        street: 'Neustiftgasse',
        houseNumber: '43',
        staircase: null,
        door: null,
        project: null,
        sources: [],
        sourceDeviations: [],
        postcodeCandidates: [],
        uncertainFields: [],
        groupingKey: '',
        relativePath: '',
        fileName: '',
      }),
    ).toBe(true);
  });
  // ── Filename admin gate (D-01 option A′) ───────────────────────────────────
  // @see docs/specs/service/media-upload-service/upload-search-object.md § Admin level map
});

// ── Country derived from the place (D-03) ─────────────────────────────────────
// @see docs/specs/service/media-upload-service/upload-search-object.country-derivation.md
describe('buildSearchObjectFromRelativePath — derived country', () => {
  const moedlingGeo = {
    states: [{ n: 'Niederösterreich', a: [] }],
    municipalities: [
      { n: 'Mödling', b: 'Niederösterreich', a: [] },
      { n: 'Schottwien', b: 'Niederösterreich', a: [] },
    ],
    postcodeMap: { '1160': ['Wien'] },
  };

  // `Wien` names a country even though the path never does, so 1090 IS a postcode here.
  // @see docs/specs/service/media-upload-service/upload-search-object.country-derivation.md
  it('derives the country from the city, which then admits the postcode', () => {
    const so = buildSearchObjectFromRelativePath(
      'Wien/1090/Neustiftgasse-43/photo.jpg',
      'photo.jpg',
      geo,
    );
    expect(so.country).toBe('AT');
    expect(so.countryProvenance).toBe('derived');
    expect(so.postcode).toBe('1090');
    expect(so.houseNumber).toBe('43');
  });

  it('does not treat a 4-digit token as postcode or house number when no place names a country', () => {
    const so = buildSearchObjectFromRelativePath(
      'Baustelle/1090/Neustiftgasse-43/photo.jpg',
      'photo.jpg',
      geo,
    );
    expect(so.country).toBeNull();
    expect(so.postcode).toBeNull();
    expect(so.houseNumber).toBe('43');
  });

  it('marks a country read from the path as parsed', () => {
    const so = buildSearchObjectFromRelativePath('AT/Wien/photo.jpg', 'photo.jpg', geo);
    expect(so.countryProvenance).toBe('parsed');
  });

  it('keeps both cities of a path that states the address twice, and flags the conflict', () => {
    const so = buildSearchObjectFromRelativePath(
      'Mödling/Wilhelminenstraße 141/Wilhelminenstr 141, 1160 Wien.jpg',
      'Wilhelminenstr 141, 1160 Wien.jpg',
      moedlingGeo,
    );

    const cityLevels = (so.adminLevelMap?.city ?? []).map((e) => `${e.level}:${e.value}`).sort();
    expect(cityLevels).toEqual(['0:Wien', '2:Mödling']);
    expect(so.postcode).toBe('1160');
    expect(so.country).toBe('AT');
    expect(so.adminLevelConflicts?.some((c) => c.field === 'city')).toBe(true);
  });
});

// ── Strong vs weak street evidence, and the all-or-nothing address side ───────
// @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
describe('buildSearchObjectFromRelativePath — street evidence', () => {
  it('does not read a house number out of a period folder', () => {
    const so = buildSearchObjectFromRelativePath(
      'Baustelle Süd/Woche 12/IMG_8001.jpg',
      'IMG_8001.jpg',
      geo,
    );

    expect(so.street).toBeNull();
    expect(so.houseNumber).toBeNull();
    expect(so.groupingKey).toBe('|||||');
  });

  it('keeps a real street from the file name under a meaningless folder', () => {
    const so = buildSearchObjectFromRelativePath(
      'Baustelle Nord/Mühlenstraße 12.jpg',
      'Mühlenstraße 12.jpg',
      geo,
    );

    expect(so.street).toBe('Mühlenstraße');
    expect(so.houseNumber).toBe('12');
  });

  it('accepts an abbreviated street name standing beside its house number', () => {
    const so = buildSearchObjectFromRelativePath(
      'Wilhelminenstr 141/IMG_1.jpg',
      'IMG_1.jpg',
      geo,
    );

    expect(so.street).toBe('Wilhelminenstr');
    expect(so.houseNumber).toBe('141');
  });

  it('drops a lone number when nothing in the path is a street', () => {
    const so = buildSearchObjectFromRelativePath(
      'Rohdaten/Kamera A/IMG_9001.jpg',
      'IMG_9001.jpg',
      geo,
    );

    expect(so.street).toBeNull();
    expect(so.houseNumber).toBeNull();
  });
});

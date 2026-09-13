import { describe, expect, it } from 'vitest';
import type { AddressLayerEntry } from './upload-search-object.layer-map';
import {
  buildAddressLayers,
  buildFlatSearchObjectFromLayers,
  detectPackageConflicts,
  FILENAME_LAYER_KEY,
  isWeakFilenameStreetLevel,
  mergeLayersWithoutConflict,
  resolveAreaContext,
  resolveLayersForJob,
  resolveSOWithChosenLayer,
} from './upload-search-object.layer-map';

const geo = {
  states: [
    { n: 'Wien', a: ['vienna'] },
    { n: 'Tirol', a: [] },
  ],
  municipalities: [
    { n: 'Wien', b: 'Wien', a: ['vienna'] },
    { n: 'Graz', b: 'Steiermark', a: [] },
    { n: 'Innsbruck', b: 'Tirol', a: [] },
  ],
  postcodeMap: { '1090': ['Wien'] },
};

const geoFull = { ...geo, postcodeMap: geo.postcodeMap };

const folderNeustift: AddressLayerEntry = {
  layerKey: 'wien/neustiftgasse 11 tur 12',
  source: 'folder',
  parsed: { street: 'Neustiftgasse', houseNumber: '11', staircase: null, door: '12' },
};

const filenameNeustift: AddressLayerEntry = {
  layerKey: FILENAME_LAYER_KEY,
  source: 'filename',
  parsed: { street: 'Neustiftgasse', houseNumber: '11', staircase: null, door: null },
};

const folderKirche: AddressLayerEntry = {
  layerKey: 'wien/bezirk/kirchengasse 11',
  source: 'folder',
  parsed: { street: 'Kirchengasse', houseNumber: '11', staircase: null },
};

const filenameGumpendorf: AddressLayerEntry = {
  layerKey: FILENAME_LAYER_KEY,
  source: 'filename',
  parsed: { street: 'Gumpendorfstraße', houseNumber: '7', staircase: null },
};

describe('upload-search-object.layer-map', () => {
  it('EX-01: folder street vs filename street triggers package conflict', () => {
    const layers = [folderKirche, filenameGumpendorf];
    const conflict = detectPackageConflicts(layers, 'wien/bezirk/kirchengasse 11');
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictingEntries).toHaveLength(2);
    expect(conflict!.layerConflictQueryKey.startsWith('layer|')).toBe(true);
  });

  it('EX-02: same street/house with folder staircase enriches without tray', () => {
    const layers = [folderNeustift, filenameNeustift];
    expect(detectPackageConflicts(layers, 'wien/neustiftgasse 11 tur 12')).toBeNull();
    const merged = mergeLayersWithoutConflict(layers);
    expect(merged.street).toBe('Neustiftgasse');
    expect(merged.houseNumber).toBe('11');
    expect(merged.door).toBe('12');
  });

  it('EX-03: filename package chosen drops folder staircase (Option A)', () => {
    const relativePath = 'Wien/Neustiftgasse 11 Tür 12/IMG_Thaliastraße_7.jpg';
    const layers: AddressLayerEntry[] = [
      folderNeustift,
      {
        layerKey: FILENAME_LAYER_KEY,
        source: 'filename',
        parsed: { street: 'Thaliastraße', houseNumber: '7', staircase: null, door: null },
      },
    ];
    const so = resolveSOWithChosenLayer(
      layers,
      FILENAME_LAYER_KEY,
      relativePath,
      'IMG_Thaliastraße_7.jpg',
      geoFull,
    );
    expect(so.street).toBe('Thaliastraße');
    expect(so.houseNumber).toBe('7');
    expect(so.staircase).toBeNull();
    expect(so.door).toBeNull();
  });

  it('EX-04: admin city unchanged when filename package wins', () => {
    const relativePath = 'Wien/Kirchengasse 11/IMG_Gumpendorfstraße_7.jpg';
    const admin = resolveAreaContext(
      relativePath,
      'IMG_Gumpendorfstraße_7.jpg',
      geoFull,
    );
    const soFolder = resolveSOWithChosenLayer(
      [folderKirche, filenameGumpendorf],
      folderKirche.layerKey,
      relativePath,
      'IMG_Gumpendorfstraße_7.jpg',
      geoFull,
    );
    const soFilename = resolveSOWithChosenLayer(
      [folderKirche, filenameGumpendorf],
      FILENAME_LAYER_KEY,
      relativePath,
      'IMG_Gumpendorfstraße_7.jpg',
      geoFull,
    );
    expect(soFilename.city).toBe(soFolder.city);
    expect(soFilename.city).toBe(admin.city);
    expect(soFilename.street).toBe('Gumpendorfstraße');
  });

  it('EX-05: locality-only intermediate segment is excluded from conflict', () => {
    const localityOnly: AddressLayerEntry = {
      layerKey: 'wien/floridsdorf',
      source: 'folder',
      parsed: {},
    };
    const folderThaliastrasse: AddressLayerEntry = {
      layerKey: 'wien/floridsdorf/thaliastraße',
      source: 'folder',
      parsed: { street: 'Thaliastraße', houseNumber: null, staircase: null, door: null },
    };
    const filenameNeustiftgasse: AddressLayerEntry = {
      layerKey: FILENAME_LAYER_KEY,
      source: 'filename',
      parsed: { street: 'Neustiftgasse', houseNumber: '11', staircase: null, door: null },
    };
    const layers = [localityOnly, folderThaliastrasse, filenameNeustiftgasse];
    const conflict = detectPackageConflicts(layers, 'wien/floridsdorf/thaliastraße');
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictingEntries).toHaveLength(2);
    expect(conflict!.conflictingEntries).not.toContain(localityOnly);
    expect(conflict!.conflictingEntries).toContain(folderThaliastrasse);
    expect(conflict!.conflictingEntries).toContain(filenameNeustiftgasse);
  });

  it('EX-06: single street-level layer — no package conflict', () => {
    const layers = [folderNeustift];
    expect(detectPackageConflicts(layers, 'wien/neustiftgasse 34')).toBeNull();
    const flat = buildFlatSearchObjectFromLayers(
      layers,
      'Wien/Neustiftgasse 34/IMG_1274.jpg',
      'IMG_1274.jpg',
      geoFull,
    );
    expect(flat.street).toBe('Neustiftgasse');
  });

  it('EX-07: identical folder and filename packages merge without conflict', () => {
    const filenameMatch: AddressLayerEntry = {
      layerKey: FILENAME_LAYER_KEY,
      source: 'filename',
      parsed: { street: 'Kirchengasse', houseNumber: '11', staircase: null },
    };
    expect(detectPackageConflicts([folderKirche, filenameMatch], 'wien')).toBeNull();
    const merged = mergeLayersWithoutConflict([folderKirche, filenameMatch]);
    expect(merged.street).toBe('Kirchengasse');
    expect(merged.houseNumber).toBe('11');
  });

  it('EX-08: weak IMG filename does not create filename street layer', () => {
    expect(isWeakFilenameStreetLevel({ street: 'IMG' }, 'IMG_1274.jpg')).toBe(true);
    const relativePath = 'Wien/Neustiftgasse 34/IMG_1274.jpg';
    const layers = buildAddressLayers(relativePath, 'IMG_1274.jpg', geoFull);
    expect(layers.find((e) => e.layerKey === FILENAME_LAYER_KEY)).toBeUndefined();
  });

  it('resolveAreaContext surfaces areaConflicts for Wien/Innsbruck', () => {
    const admin = resolveAreaContext(
      'AT/Wien/Innsbruck/photo.jpg',
      'photo.jpg',
      geoFull,
    );
    expect(admin.areaConflicts?.length).toBeGreaterThan(0);
    expect(admin.areaEvidence?.city?.some((e) => e.value === 'Innsbruck')).toBe(true);
  });

  it('resolveLayersForJob attaches admin conflicts to flat search object', () => {
    const result = resolveLayersForJob(
      'AT/Wien/Innsbruck/photo.jpg',
      'photo.jpg',
      geoFull,
      'Wien/Innsbruck',
    );
    expect(result.searchObject.areaConflicts?.length).toBeGreaterThan(0);
  });
});

// ── Only a real street forms a package; one street spelled two ways is not a question ─────────
// @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
describe('buildAddressLayers — weak segments never compete', () => {
  const geoAt = {
    states: [{ n: 'Niederösterreich', a: [] }],
    municipalities: [{ n: 'Mödling', b: 'Niederösterreich', a: [] }],
    postcodeMap: { '1160': ['Wien'] },
  };

  it('a meaningless folder does not compete with a real street in the file name', () => {
    const layers = buildAddressLayers(
      'Baustelle Nord/Mühlenstraße 12.jpg',
      'Mühlenstraße 12.jpg',
      geoAt,
    );

    expect(layers.map((entry) => entry.source)).toEqual(['filename']);
    expect(detectPackageConflicts(layers, 'Baustelle Nord')).toBeNull();
  });

  it('folds the str. abbreviation, so one address is not two packages', () => {
    const layers = buildAddressLayers(
      'Mödling/Wilhelminenstraße 141/Wilhelminenstr 141, 1160 Wien.jpg',
      'Wilhelminenstr 141, 1160 Wien.jpg',
      geoAt,
    );

    expect(detectPackageConflicts(layers, 'Mödling/Wilhelminenstraße 141')).toBeNull();
  });

  it('keeps a genuine disagreement about the house number', () => {
    const layers = buildAddressLayers(
      'Graz/Annenstraße 10/Annenstraße 12 Detail.jpg',
      'Annenstraße 12 Detail.jpg',
      geoAt,
    );

    expect(detectPackageConflicts(layers, 'Graz/Annenstraße 10')).not.toBeNull();
  });

  it('does not form a package from a house number with no street', () => {
    const layers = buildAddressLayers('Baustelle Süd/Woche 12/IMG_8001.jpg', 'IMG_8001.jpg', geoAt);

    expect(layers).toEqual([]);
  });
});

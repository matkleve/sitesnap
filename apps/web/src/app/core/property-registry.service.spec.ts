import { TestBed } from '@angular/core/testing';
import { PropertyRegistryService } from './property-registry.service';
import type { WorkspaceImage } from './workspace-view.types';

function makeImage(overrides: Partial<WorkspaceImage> = {}): WorkspaceImage {
  return {
    id: crypto.randomUUID(),
    latitude: 47.3769,
    longitude: 8.5417,
    thumbnailPath: null,
    storagePath: 'org/user/photo.jpg',
    capturedAt: '2025-06-01T12:00:00Z',
    createdAt: '2025-06-02T08:00:00Z',
    projectId: 'proj-1',
    projectName: 'Bridge Inspection',
    direction: null,
    exifLatitude: 47.3769,
    exifLongitude: 8.5417,
    addressLabel: 'Burgstraße 7, 8001 Zürich',
    city: 'Zürich',
    district: 'Altstadt',
    street: 'Burgstraße 7',
    country: 'Switzerland',
    userName: 'Max Mustermann',
    ...overrides,
  };
}

describe('PropertyRegistryService', () => {
  let service: PropertyRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PropertyRegistryService] });
    service = TestBed.inject(PropertyRegistryService);
  });

  // ── Built-in properties ──────────────────────────────────────────────────

  describe('built-in property lists', () => {
    it('includes at least 10 built-in properties', () => {
      expect(service.allProperties().length).toBeGreaterThanOrEqual(10);
      expect(service.allProperties().every((p) => p.id && p.label && p.icon)).toBe(true);
    });

    it('sortableProperties only lists properties with sortable capability', () => {
      for (const p of service.sortableProperties()) {
        expect(p.capabilities.sortable).toBe(true);
      }
      expect(service.sortableProperties().length).toBeGreaterThan(0);
    });

    it('groupableProperties only lists properties with groupable capability', () => {
      for (const p of service.groupableProperties()) {
        expect(p.capabilities.groupable).toBe(true);
      }
      expect(service.groupableProperties().length).toBeGreaterThan(0);
    });

    it('filterableProperties only lists properties with filterable capability', () => {
      for (const p of service.filterableProperties()) {
        expect(p.capabilities.filterable).toBe(true);
      }
      expect(service.filterableProperties().length).toBeGreaterThan(0);
    });

    it('searchableProperties only lists properties with searchable capability', () => {
      for (const p of service.searchableProperties()) {
        expect(p.capabilities.searchable).toBe(true);
      }
      expect(service.searchableProperties().length).toBeGreaterThan(0);
    });
  });

  // ── getProperty ──────────────────────────────────────────────────────────

  describe('getProperty', () => {
    it('finds a built-in property by ID', () => {
      const prop = service.getProperty('date-captured');
      expect(prop).toBeDefined();
      expect(prop!.label).toBe('Date captured');
    });

    it('returns undefined for unknown ID', () => {
      expect(service.getProperty('nonexistent')).toBeUndefined();
    });
  });

  // ── getSortValue ─────────────────────────────────────────────────────────

  describe('getSortValue', () => {
    it('resolves date-captured', () => {
      const img = makeImage();
      expect(service.getSortValue(img, 'date-captured')).toBe('2025-06-01T12:00:00Z');
    });

    it('resolves date-uploaded (alias created_at)', () => {
      const img = makeImage();
      expect(service.getSortValue(img, 'date-uploaded')).toBe('2025-06-02T08:00:00Z');
      expect(service.getSortValue(img, 'created_at')).toBe('2025-06-02T08:00:00Z');
    });

    it('resolves name from storagePath', () => {
      const img = makeImage();
      expect(service.getSortValue(img, 'name')).toBe('org/user/photo.jpg');
    });

    it('resolves address fields', () => {
      const img = makeImage();
      expect(service.getSortValue(img, 'city')).toBe('Zürich');
      expect(service.getSortValue(img, 'country')).toBe('Switzerland');
      expect(service.getSortValue(img, 'street')).toBe('Burgstraße 7');
    });

    it('returns null for unknown property without metadata', () => {
      const img = makeImage();
      expect(service.getSortValue(img, 'unknown-prop')).toBeNull();
    });
  });

  // ── getGroupValue ────────────────────────────────────────────────────────

  describe('getGroupValue', () => {
    it('returns project name as group heading', () => {
      const img = makeImage();
      expect(service.getGroupValue(img, 'project')).toBe('Bridge Inspection');
    });

    it('returns "No project" when projectName is null', () => {
      const img = makeImage({ projectName: null });
      expect(service.getGroupValue(img, 'project')).toBe('No project');
    });

    it('returns year from capturedAt', () => {
      const img = makeImage({ capturedAt: '2024-03-15T10:00:00Z' });
      expect(service.getGroupValue(img, 'year')).toBe('2024');
    });

    it('returns "Unknown year" when capturedAt is null', () => {
      const img = makeImage({ capturedAt: null });
      expect(service.getGroupValue(img, 'year')).toBe('Unknown year');
    });

    it('returns city with fallback', () => {
      expect(service.getGroupValue(makeImage(), 'city')).toBe('Zürich');
      expect(service.getGroupValue(makeImage({ city: null }), 'city')).toBe('Unknown city');
    });

    it('returns "No {id}" for unknown groupable property', () => {
      const img = makeImage();
      expect(service.getGroupValue(img, 'nonexistent')).toBe('No nonexistent');
    });
  });

  // ── getFieldValue ────────────────────────────────────────────────────────

  describe('getFieldValue', () => {
    it('resolves built-in fields as strings', () => {
      const img = makeImage();
      expect(service.getFieldValue(img, 'project')).toBe('Bridge Inspection');
      expect(service.getFieldValue(img, 'city')).toBe('Zürich');
      expect(service.getFieldValue(img, 'user')).toBe('Max Mustermann');
    });

    it('returns null for null field values', () => {
      const img = makeImage({ city: null });
      expect(service.getFieldValue(img, 'city')).toBeNull();
    });

    it('returns null for unknown property without metadata', () => {
      const img = makeImage();
      expect(service.getFieldValue(img, 'unknown')).toBeNull();
    });
  });

  // ── Custom properties ────────────────────────────────────────────────────

  describe('custom properties', () => {
    it('setCustomProperties adds properties to all lists', () => {
      const before = service.allProperties().length;
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
        { id: 'inspection-date', key_name: 'Inspection Date', key_type: 'date' },
      ]);
      expect(service.allProperties().length).toBe(before + 2);
    });

    it('custom properties appear in all capability lists', () => {
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
      ]);
      expect(service.sortableProperties().some((p) => p.id === 'chimney-number')).toBe(true);
      expect(service.groupableProperties().some((p) => p.id === 'chimney-number')).toBe(true);
      expect(service.filterableProperties().some((p) => p.id === 'chimney-number')).toBe(true);
      expect(service.searchableProperties().some((p) => p.id === 'chimney-number')).toBe(true);
    });

    it('custom properties are not marked as builtIn', () => {
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
      ]);
      const prop = service.getProperty('chimney-number');
      expect(prop).toBeDefined();
      expect(prop!.builtIn).toBe(false);
    });

    it('getProperty finds custom properties by ID', () => {
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
      ]);
      const prop = service.getProperty('chimney-number');
      expect(prop!.label).toBe('Chimney Number');
    });

    it('resolves custom property value from image metadata', () => {
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
      ]);
      const img = makeImage({ metadata: { 'chimney-number': 'CH-42' } });

      expect(service.getSortValue(img, 'chimney-number')).toBe('CH-42');
      expect(service.getGroupValue(img, 'chimney-number')).toBe('Chimney Number CH-42');
      expect(service.getFieldValue(img, 'chimney-number')).toBe('CH-42');
    });

    it('returns fallback when custom property has no metadata', () => {
      service.setCustomProperties([
        { id: 'chimney-number', key_name: 'Chimney Number', key_type: 'text' },
      ]);
      const img = makeImage();
      expect(service.getSortValue(img, 'chimney-number')).toBeNull();
      expect(service.getGroupValue(img, 'chimney-number')).toBe('No Chimney Number');
      expect(service.getFieldValue(img, 'chimney-number')).toBeNull();
    });
  });

  // ── Numeric custom properties ──────────────────────────────────────────

  describe('numeric custom properties', () => {
    beforeEach(() => {
      service.setCustomProperties([{ id: 'fang', key_name: 'Fang', key_type: 'number' }]);
    });

    it('getSortValue returns parsed number for number-type property', () => {
      const img = makeImage({ metadata: { fang: '42' } });
      expect(service.getSortValue(img, 'fang')).toBe(42);
    });

    it('getSortValue returns float for decimal values', () => {
      const img = makeImage({ metadata: { fang: '3.14' } });
      expect(service.getSortValue(img, 'fang')).toBeCloseTo(3.14);
    });

    it('getSortValue returns null for non-numeric string', () => {
      const img = makeImage({ metadata: { fang: 'abc' } });
      expect(service.getSortValue(img, 'fang')).toBeNull();
    });

    it('getSortValue returns null for empty string', () => {
      const img = makeImage({ metadata: { fang: '' } });
      expect(service.getSortValue(img, 'fang')).toBeNull();
    });

    it('getGroupValue returns label + value', () => {
      const img = makeImage({ metadata: { fang: '42' } });
      expect(service.getGroupValue(img, 'fang')).toBe('Fang 42');
    });

    it('getGroupValue returns "No {label}" for NaN', () => {
      const img = makeImage({ metadata: { fang: 'abc' } });
      expect(service.getGroupValue(img, 'fang')).toBe('No Fang');
    });

    it('getFieldValue returns string for number-type property', () => {
      const img = makeImage({ metadata: { fang: '42' } });
      expect(service.getFieldValue(img, 'fang')).toBe('42');
    });

    it('text-type property returns raw string (not parsed)', () => {
      service.setCustomProperties([{ id: 'label', key_name: 'Label', key_type: 'text' }]);
      const img = makeImage({ metadata: { label: '42' } });
      expect(service.getSortValue(img, 'label')).toBe('42');
      expect(typeof service.getSortValue(img, 'label')).toBe('string');
    });
  });
});

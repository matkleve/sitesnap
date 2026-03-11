import { TestBed } from '@angular/core/testing';
import { FilterService } from './filter.service';
import { PropertyRegistryService } from './property-registry.service';
import type { FilterRule, WorkspaceImage } from './workspace-view.types';

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

function makeRule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: 'rule-1',
    conjunction: 'where',
    property: '',
    operator: '',
    value: '',
    ...overrides,
  };
}

describe('FilterService', () => {
  let service: FilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FilterService, PropertyRegistryService],
    });
    service = TestBed.inject(FilterService);
  });

  // ── Rule management ────────────────────────────────────────────────────

  describe('rule management', () => {
    it('starts with no rules', () => {
      expect(service.rules()).toEqual([]);
      expect(service.activeCount()).toBe(0);
    });

    it('addRule creates a new rule', () => {
      service.addRule();
      expect(service.rules().length).toBe(1);
      expect(service.rules()[0].conjunction).toBe('where');
    });

    it('second rule gets "and" conjunction', () => {
      service.addRule();
      service.addRule();
      expect(service.rules()[1].conjunction).toBe('and');
    });

    it('updateRule patches a rule', () => {
      service.addRule();
      const id = service.rules()[0].id;
      service.updateRule(id, { property: 'city', operator: 'contains', value: 'Zürich' });
      expect(service.rules()[0].property).toBe('city');
      expect(service.rules()[0].operator).toBe('contains');
    });

    it('removeRule removes the rule', () => {
      service.addRule();
      service.addRule();
      const id = service.rules()[0].id;
      service.removeRule(id);
      expect(service.rules().length).toBe(1);
    });

    it('clearAll removes all rules', () => {
      service.addRule();
      service.addRule();
      service.clearAll();
      expect(service.rules()).toEqual([]);
    });
  });

  // ── Text operators ─────────────────────────────────────────────────────

  describe('text operators', () => {
    it('"contains" matches substring', () => {
      const img = makeImage({ city: 'Zürich' });
      const rule = makeRule({ property: 'city', operator: 'contains', value: 'üri' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });

    it('"contains" is case-insensitive', () => {
      const img = makeImage({ city: 'Zürich' });
      const rule = makeRule({ property: 'city', operator: 'contains', value: 'ZÜRICH' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });

    it('"is" checks exact match (case-insensitive)', () => {
      const img = makeImage({ city: 'Zürich' });
      expect(
        service.matchesClientSide(img, [
          makeRule({ property: 'city', operator: 'is', value: 'zürich' }),
        ]),
      ).toBe(true);
      expect(
        service.matchesClientSide(img, [
          makeRule({ property: 'city', operator: 'is', value: 'Bern' }),
        ]),
      ).toBe(false);
    });

    it('"is not" checks inequality', () => {
      const img = makeImage({ city: 'Zürich' });
      const rule = makeRule({ property: 'city', operator: 'is not', value: 'Bern' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });
  });

  // ── Numeric operators ──────────────────────────────────────────────────

  describe('numeric operators', () => {
    const registry = () => TestBed.inject(PropertyRegistryService);

    beforeEach(() => {
      registry().setCustomProperties([{ id: 'fang', key_name: 'Fang', key_type: 'number' }]);
    });

    function imgWithFang(value: string): WorkspaceImage {
      return makeImage({ metadata: { fang: value } });
    }

    it('"=" matches equal numbers', () => {
      const rule = makeRule({ property: 'fang', operator: '=', value: '42' });
      expect(service.matchesClientSide(imgWithFang('42'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('43'), [rule])).toBe(false);
    });

    it('"≠" matches unequal numbers', () => {
      const rule = makeRule({ property: 'fang', operator: '≠', value: '42' });
      expect(service.matchesClientSide(imgWithFang('43'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('42'), [rule])).toBe(false);
    });

    it('">" matches greater-than', () => {
      const rule = makeRule({ property: 'fang', operator: '>', value: '10' });
      expect(service.matchesClientSide(imgWithFang('15'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('10'), [rule])).toBe(false);
      expect(service.matchesClientSide(imgWithFang('5'), [rule])).toBe(false);
    });

    it('"<" matches less-than', () => {
      const rule = makeRule({ property: 'fang', operator: '<', value: '10' });
      expect(service.matchesClientSide(imgWithFang('5'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('10'), [rule])).toBe(false);
    });

    it('"≥" matches greater-or-equal', () => {
      const rule = makeRule({ property: 'fang', operator: '≥', value: '10' });
      expect(service.matchesClientSide(imgWithFang('10'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('11'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('9'), [rule])).toBe(false);
    });

    it('"≤" matches less-or-equal', () => {
      const rule = makeRule({ property: 'fang', operator: '≤', value: '10' });
      expect(service.matchesClientSide(imgWithFang('10'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('9'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('11'), [rule])).toBe(false);
    });

    it('returns false when field is not a number', () => {
      const rule = makeRule({ property: 'fang', operator: '>', value: '10' });
      expect(service.matchesClientSide(imgWithFang('abc'), [rule])).toBe(false);
    });

    it('returns false when rule value is not a number', () => {
      const rule = makeRule({ property: 'fang', operator: '>', value: 'abc' });
      expect(service.matchesClientSide(imgWithFang('10'), [rule])).toBe(false);
    });

    it('handles decimal numbers', () => {
      const rule = makeRule({ property: 'fang', operator: '>', value: '3.5' });
      expect(service.matchesClientSide(imgWithFang('3.7'), [rule])).toBe(true);
      expect(service.matchesClientSide(imgWithFang('3.2'), [rule])).toBe(false);
    });
  });

  // ── Null handling ──────────────────────────────────────────────────────

  describe('null handling', () => {
    it('null field fails "contains"', () => {
      const img = makeImage({ city: null });
      const rule = makeRule({ property: 'city', operator: 'contains', value: 'test' });
      expect(service.matchesClientSide(img, [rule])).toBe(false);
    });

    it('null field passes "is not" when value is non-empty', () => {
      const img = makeImage({ city: null });
      const rule = makeRule({ property: 'city', operator: 'is not', value: 'Bern' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });

    it('null field passes "≠" when value is non-empty', () => {
      const img = makeImage({ city: null });
      const rule = makeRule({ property: 'city', operator: '≠', value: '10' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });
  });

  // ── Conjunction logic ──────────────────────────────────────────────────

  describe('conjunction logic', () => {
    it('AND: both rules must pass', () => {
      const img = makeImage({ city: 'Zürich', country: 'Switzerland' });
      const rules: FilterRule[] = [
        makeRule({
          id: 'r1',
          conjunction: 'where',
          property: 'city',
          operator: 'is',
          value: 'Zürich',
        }),
        makeRule({
          id: 'r2',
          conjunction: 'and',
          property: 'country',
          operator: 'is',
          value: 'Switzerland',
        }),
      ];
      expect(service.matchesClientSide(img, rules)).toBe(true);
    });

    it('AND: fails when one rule fails', () => {
      const img = makeImage({ city: 'Zürich', country: 'Switzerland' });
      const rules: FilterRule[] = [
        makeRule({
          id: 'r1',
          conjunction: 'where',
          property: 'city',
          operator: 'is',
          value: 'Zürich',
        }),
        makeRule({
          id: 'r2',
          conjunction: 'and',
          property: 'country',
          operator: 'is',
          value: 'Germany',
        }),
      ];
      expect(service.matchesClientSide(img, rules)).toBe(false);
    });

    it('OR: passes when at least one rule passes', () => {
      const img = makeImage({ city: 'Zürich' });
      const rules: FilterRule[] = [
        makeRule({
          id: 'r1',
          conjunction: 'where',
          property: 'city',
          operator: 'is',
          value: 'Bern',
        }),
        makeRule({
          id: 'r2',
          conjunction: 'or',
          property: 'city',
          operator: 'is',
          value: 'Zürich',
        }),
      ];
      expect(service.matchesClientSide(img, rules)).toBe(true);
    });

    it('empty rules pass all images', () => {
      const img = makeImage();
      expect(service.matchesClientSide(img, [])).toBe(true);
    });

    it('incomplete rules (no property) pass', () => {
      const img = makeImage();
      const rule = makeRule({ property: '', operator: 'contains', value: 'test' });
      expect(service.matchesClientSide(img, [rule])).toBe(true);
    });
  });
});

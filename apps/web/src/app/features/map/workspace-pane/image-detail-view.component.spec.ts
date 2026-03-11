/**
 * ImageDetailViewComponent — inline editing tests.
 *
 * Strategy:
 *  - SupabaseService is faked with a chainable client mock.
 *  - Signal inputs are set via `fixture.componentRef.setInput()`.
 *  - Tests verify editing flows: optimistic updates, rollback, metadata CRUD.
 *  - Use cases covered: IE-1 through IE-9 from use-cases/image-editing.md.
 */

import { TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import {
  ImageDetailViewComponent,
  ImageRecord,
  MetadataEntry,
} from './image-detail-view.component';
import { SupabaseService } from '../../../core/supabase.service';
import { GeocodingService } from '../../../core/geocoding.service';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_IMAGE: ImageRecord = {
  id: 'img-001',
  user_id: 'user-001',
  organization_id: 'org-001',
  project_id: 'proj-001',
  storage_path: 'org-001/user-001/photo.jpg',
  thumbnail_path: 'org-001/user-001/photo_thumb.jpg',
  latitude: 48.2082,
  longitude: 16.3738,
  exif_latitude: 48.2082,
  exif_longitude: 16.3738,
  captured_at: '2025-06-15T10:30:00Z',
  created_at: '2025-06-15T12:00:00Z',
  address_label: 'Stephansplatz 1, Wien',
  street: 'Stephansplatz',
  city: 'Wien',
  district: 'Innere Stadt',
  country: 'Austria',
  direction: 180,
  location_unresolved: false,
  has_time: true,
};

const MOCK_CORRECTED_IMAGE: ImageRecord = {
  ...MOCK_IMAGE,
  latitude: 48.209,
  longitude: 16.3745,
};

const MOCK_METADATA: MetadataEntry[] = [
  { metadataKeyId: 'mk-001', key: 'Building type', value: 'Residential' },
  { metadataKeyId: 'mk-002', key: 'Floor', value: '3rd' },
];

// ── Fake Supabase client ──────────────────────────────────────────────────────

/**
 * Builds a chainable fake Supabase client.
 * Each table builder records its calls and returns configurable responses.
 */
function buildFakeClient() {
  // Track per-table interactions
  const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn });

  const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });

  const deleteEq2Fn = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteEq1Fn = vi.fn().mockReturnValue({ eq: deleteEq2Fn });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq1Fn });

  // For metadata_keys lookup: .select('id').eq(...).eq(...).maybeSingle()
  const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const insertSelectSingleFn = vi.fn().mockResolvedValue({
    data: { id: 'mk-new' },
    error: null,
  });
  const insertSelectFn = vi.fn().mockReturnValue({ single: insertSelectSingleFn });
  const insertFn = vi.fn().mockReturnValue({ select: insertSelectFn });

  // For images.select('*').eq('id', ...).single()
  const imageSingleFn = vi.fn().mockResolvedValue({ data: MOCK_IMAGE, error: null });

  // For image_metadata.select(...).eq('image_id', ...)
  const metaSelectEqFn = vi.fn().mockResolvedValue({ data: [], error: null });

  // For projects.select('id, name').eq('organization_id', ...).order('name')
  const projectOrderFn = vi.fn().mockResolvedValue({
    data: [
      { id: 'proj-001', name: 'Project Alpha' },
      { id: 'proj-002', name: 'Project Beta' },
    ],
    error: null,
  });

  // For metadata_keys.select('key_name').eq('organization_id', ...).order('key_name')
  const metaKeysOrderFn = vi.fn().mockResolvedValue({
    data: [{ key_name: 'Building type' }, { key_name: 'Floor' }, { key_name: 'Phase' }],
    error: null,
  });

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'images') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: imageSingleFn }),
          }),
          update: updateFn,
          delete: deleteFn,
        };
      }
      if (table === 'image_metadata') {
        return {
          select: vi.fn().mockReturnValue({ eq: metaSelectEqFn }),
          upsert: upsertFn,
          delete: deleteFn,
        };
      }
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'key_name') {
              // loadMetadataKeys: .select('key_name').eq(...).order(...)
              return {
                eq: vi.fn().mockReturnValue({ order: metaKeysOrderFn }),
              };
            }
            // addMetadata lookup: .select('id').eq(...).eq(...).maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }),
              }),
            };
          }),
          insert: insertFn,
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: projectOrderFn }),
          }),
        };
      }
      // Fallback — generic no-op builder
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed' },
          error: null,
        }),
      }),
    },
  };

  return {
    client,
    updateFn,
    updateEqFn,
    upsertFn,
    deleteFn,
    deleteEq1Fn,
    deleteEq2Fn,
    insertFn,
    maybeSingleFn,
    imageSingleFn,
    metaSelectEqFn,
    projectOrderFn,
    metaKeysOrderFn,
  };
}

// ── Setup helper ──────────────────────────────────────────────────────────────

function setup() {
  const fake = buildFakeClient();
  const fakeGeocoding = {
    forward: vi.fn().mockResolvedValue(null),
    reverse: vi.fn().mockResolvedValue(null),
  };

  TestBed.configureTestingModule({
    imports: [ImageDetailViewComponent],
    providers: [
      { provide: SupabaseService, useValue: { client: fake.client } },
      { provide: GeocodingService, useValue: fakeGeocoding },
    ],
  });

  const fixture = TestBed.createComponent(ImageDetailViewComponent);
  const component = fixture.componentInstance;
  const ref = fixture.componentRef as ComponentRef<ImageDetailViewComponent>;

  // Trigger initial change detection without setting imageId (stays null).
  fixture.detectChanges();

  return { component, fixture, ref, fake, fakeGeocoding };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ImageDetailViewComponent', () => {
  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with null image and empty metadata', () => {
      const { component } = setup();
      expect(component.image()).toBeNull();
      expect(component.metadata()).toEqual([]);
      expect(component.loading()).toBe(false);
      expect(component.editingField()).toBeNull();
    });

    it('has saving signal initialized to false', () => {
      const { component } = setup();
      expect(component.saving()).toBe(false);
    });

    it('has empty project options by default', () => {
      const { component } = setup();
      expect(component.projectOptions()).toEqual([]);
    });

  });

  // ── Computed signals ─────────────────────────────────────────────────────

  describe('computed signals', () => {
    it('displayTitle returns address_label when available', () => {
      const { component } = setup();
      component.image.set(MOCK_IMAGE);
      expect(component.displayTitle()).toBe('Stephansplatz 1, Wien');
    });

    it('displayTitle falls back to filename when no address_label', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, address_label: null });
      expect(component.displayTitle()).toBe('photo.jpg');
    });

    it('displayTitle returns empty string when image is null', () => {
      const { component } = setup();
      expect(component.displayTitle()).toBe('');
    });

    it('isCorrected returns false when coords match EXIF', () => {
      const { component } = setup();
      component.image.set(MOCK_IMAGE);
      expect(component.isCorrected()).toBe(false);
    });

    it('isCorrected returns true when coords differ from EXIF', () => {
      const { component } = setup();
      component.image.set(MOCK_CORRECTED_IMAGE);
      expect(component.isCorrected()).toBe(true);
    });

    it('isCorrected returns false when lat/exif_lat is null', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, latitude: null });
      expect(component.isCorrected()).toBe(false);
    });

    it('captureDate formats captured_at', () => {
      const { component } = setup();
      component.image.set(MOCK_IMAGE);
      const date = component.captureDate();
      expect(date).toBeTruthy();
      expect(date).toContain('2025');
    });

    it('captureDate returns null when image is null', () => {
      const { component } = setup();
      expect(component.captureDate()).toBeNull();
    });

    it('uploadDate formats created_at', () => {
      const { component } = setup();
      component.image.set(MOCK_IMAGE);
      const date = component.uploadDate();
      expect(date).toBeTruthy();
      expect(date).toContain('2025');
    });

    it('projectName returns matching project label', () => {
      const { component } = setup();
      component.image.set(MOCK_IMAGE);
      component.projectOptions.set([
        { id: 'proj-001', label: 'Project Alpha' },
        { id: 'proj-002', label: 'Project Beta' },
      ]);
      expect(component.projectName()).toBe('Project Alpha');
    });

    it('projectName returns empty string when no project assigned', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, project_id: null });
      expect(component.projectName()).toBe('');
    });

    it('projectName returns empty string when project not in options', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, project_id: 'proj-999' });
      component.projectOptions.set([{ id: 'proj-001', label: 'Alpha' }]);
      expect(component.projectName()).toBe('');
    });
  });

  // ── saveImageField (IE-1, IE-2, IE-3, IE-7) ────────────────────────────

  describe('saveImageField', () => {
    it('updates address_label optimistically', async () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveImageField('address_label', 'New Address');

      expect(component.image()!.address_label).toBe('New Address');
      expect(component.editingField()).toBeNull();
      expect(component.saving()).toBe(false);
    });

    it('calls Supabase images.update for a changed field', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveImageField('city', 'Graz');

      expect(fake.client.from).toHaveBeenCalledWith('images');
      expect(fake.updateFn).toHaveBeenCalledWith({ city: 'Graz' });
      expect(fake.updateEqFn).toHaveBeenCalledWith('id', MOCK_IMAGE.id);
    });

    it('skips save when value is unchanged', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });
      fake.client.from.mockClear();

      await component.saveImageField('city', 'Wien');

      expect(fake.updateFn).not.toHaveBeenCalled();
    });

    it('stores null for empty string values', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveImageField('district', '');

      expect(component.image()!.district).toBeNull();
      expect(fake.updateFn).toHaveBeenCalledWith({ district: null });
    });

    it('does nothing when image is null', async () => {
      const { component, fake } = setup();
      component.image.set(null);
      fake.client.from.mockClear();

      await component.saveImageField('city', 'Wien');

      expect(fake.client.from).not.toHaveBeenCalled();
    });

    it('rolls back on Supabase error', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });
      fake.updateEqFn.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await component.saveImageField('city', 'Graz');

      // Rolled back to original value
      expect(component.image()!.city).toBe('Wien');
      expect(component.saving()).toBe(false);
    });
  });

  // ── saveMetadata (IE-4) ─────────────────────────────────────────────────

  describe('saveMetadata', () => {
    it('updates metadata value optimistically', async () => {
      const { component, ref } = setup();
      ref.setInput('imageId', 'img-001');
      component.image.set({ ...MOCK_IMAGE });
      component.metadata.set([...MOCK_METADATA]);

      await component.saveMetadata(MOCK_METADATA[0], 'Commercial');

      expect(component.metadata()[0].value).toBe('Commercial');
    });

    it('calls upsert on image_metadata table', async () => {
      const { component, ref, fake } = setup();
      ref.setInput('imageId', 'img-001');
      component.image.set({ ...MOCK_IMAGE });
      component.metadata.set([...MOCK_METADATA]);

      await component.saveMetadata(MOCK_METADATA[0], 'Commercial');

      expect(fake.client.from).toHaveBeenCalledWith('image_metadata');
      expect(fake.upsertFn).toHaveBeenCalledWith(
        {
          image_id: 'img-001',
          metadata_key_id: 'mk-001',
          value_text: 'Commercial',
        },
        { onConflict: 'image_id,metadata_key_id' },
      );
    });

    it('skips save when value is unchanged', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });
      component.metadata.set([...MOCK_METADATA]);
      fake.upsertFn.mockClear();

      await component.saveMetadata(MOCK_METADATA[0], 'Residential');

      expect(fake.upsertFn).not.toHaveBeenCalled();
    });

    it('does nothing when imageId is null', async () => {
      const { component, fake } = setup();
      component.metadata.set([...MOCK_METADATA]);
      fake.upsertFn.mockClear();

      await component.saveMetadata(MOCK_METADATA[0], 'New Value');

      expect(fake.upsertFn).not.toHaveBeenCalled();
    });

    it('rolls back on upsert error', async () => {
      const { component, ref, fake } = setup();
      ref.setInput('imageId', 'img-001');
      component.image.set({ ...MOCK_IMAGE });
      component.metadata.set([...MOCK_METADATA]);
      fake.upsertFn.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await component.saveMetadata(MOCK_METADATA[0], 'Commercial');

      // Rolled back
      expect(component.metadata()[0].value).toBe('Residential');
    });
  });

  // ── removeMetadata (IE-6) ───────────────────────────────────────────────

  describe('removeMetadata', () => {
    it('removes entry optimistically', async () => {
      const { component, ref } = setup();
      ref.setInput('imageId', 'img-001');
      component.metadata.set([...MOCK_METADATA]);

      await component.removeMetadata(MOCK_METADATA[0]);

      expect(component.metadata().length).toBe(1);
      expect(component.metadata()[0].key).toBe('Floor');
    });

    it('does nothing when imageId is null', async () => {
      const { component, fake } = setup();
      component.metadata.set([...MOCK_METADATA]);
      fake.deleteFn.mockClear();

      await component.removeMetadata(MOCK_METADATA[0]);

      expect(component.metadata().length).toBe(2);
    });

    it('rolls back on delete error', async () => {
      const { component, ref, fake } = setup();
      ref.setInput('imageId', 'img-001');
      component.metadata.set([...MOCK_METADATA]);
      fake.deleteEq2Fn.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await component.removeMetadata(MOCK_METADATA[0]);

      expect(component.metadata().length).toBe(2);
    });
  });

  // ── addMetadata (IE-5) ──────────────────────────────────────────────────

  describe('addMetadata', () => {
    it('does nothing with empty key', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });
      fake.client.from.mockClear();

      await component.addMetadata('', 'value');

      expect(fake.client.from).not.toHaveBeenCalled();
    });

    it('does nothing with empty value', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });
      fake.client.from.mockClear();

      await component.addMetadata('key', '');

      expect(fake.client.from).not.toHaveBeenCalled();
    });

    it('does nothing when image is null', async () => {
      const { component, fake } = setup();
      component.image.set(null);
      fake.client.from.mockClear();

      await component.addMetadata('Floor', '5th');

      expect(fake.client.from).not.toHaveBeenCalled();
    });

    it('appends new entry to metadata list on success', async () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE });
      component.metadata.set([]);

      await component.addMetadata('Phase', 'Construction');

      expect(component.metadata().length).toBe(1);
      expect(component.metadata()[0].key).toBe('Phase');
      expect(component.metadata()[0].value).toBe('Construction');
    });
  });

  // ── editing field / escape to cancel (IE-8) ─────────────────────────────

  describe('editingField', () => {
    it('can be set to a field name', () => {
      const { component } = setup();
      component.editingField.set('address_label');
      expect(component.editingField()).toBe('address_label');
    });

    it('resets to null (cancel via Escape in template)', () => {
      const { component } = setup();
      component.editingField.set('address_label');
      component.editingField.set(null);
      expect(component.editingField()).toBeNull();
    });
  });

  // ── Delete flow ──────────────────────────────────────────────────────────

  describe('delete flow', () => {
    it('confirmDelete shows dialog and hides context menu', () => {
      const { component } = setup();
      component.showContextMenu.set(true);

      component.confirmDelete();

      expect(component.showDeleteConfirm()).toBe(true);
      expect(component.showContextMenu()).toBe(false);
    });

    it('cancelDelete hides the dialog', () => {
      const { component } = setup();
      component.showDeleteConfirm.set(true);

      component.cancelDelete();

      expect(component.showDeleteConfirm()).toBe(false);
    });

    it('executeDelete calls Supabase delete and emits closed', async () => {
      const { component, ref, fake } = setup();
      ref.setInput('imageId', 'img-001');
      let closedEmitted = false;
      component.closed.subscribe(() => (closedEmitted = true));

      await component.executeDelete();

      expect(fake.client.from).toHaveBeenCalledWith('images');
      expect(closedEmitted).toBe(true);
    });

    it('executeDelete does nothing when imageId is null', async () => {
      const { component, fake } = setup();
      fake.deleteFn.mockClear();
      let closedEmitted = false;
      component.closed.subscribe(() => (closedEmitted = true));

      await component.executeDelete();

      expect(closedEmitted).toBe(false);
    });
  });

  // ── Context menu ─────────────────────────────────────────────────────────

  describe('context menu', () => {
    it('toggleContextMenu toggles visibility', () => {
      const { component } = setup();

      component.toggleContextMenu();
      expect(component.showContextMenu()).toBe(true);

      component.toggleContextMenu();
      expect(component.showContextMenu()).toBe(false);
    });

    it('closeContextMenu sets false', () => {
      const { component } = setup();
      component.showContextMenu.set(true);

      component.closeContextMenu();

      expect(component.showContextMenu()).toBe(false);
    });
  });

  // ── formatCoord ──────────────────────────────────────────────────────────

  describe('formatCoord', () => {
    it('formats a number to 6 decimal places', () => {
      const { component } = setup();
      expect(component['formatCoord'](48.208174)).toBe('48.208174');
    });

    it('returns em-dash for null', () => {
      const { component } = setup();
      expect(component['formatCoord'](null)).toBe('—');
    });
  });

  // ── close ────────────────────────────────────────────────────────────────

  describe('close', () => {
    it('emits closed event', () => {
      const { component } = setup();
      let emitted = false;
      component.closed.subscribe(() => (emitted = true));

      component.close();

      expect(emitted).toBe(true);
    });
  });

  // ── requestEditLocation ──────────────────────────────────────────────────

  describe('requestEditLocation', () => {
    it('emits editLocationRequested with imageId', () => {
      const { component, ref } = setup();
      ref.setInput('imageId', 'img-001');
      let emittedId = '';
      component.editLocationRequested.subscribe((id: string) => (emittedId = id));

      component.requestEditLocation();

      expect(emittedId).toBe('img-001');
    });

    it('does not emit when imageId is null', () => {
      const { component } = setup();
      let emitted = false;
      component.editLocationRequested.subscribe(() => (emitted = true));

      component.requestEditLocation();

      expect(emitted).toBe(false);
    });
  });

  // ── Address search ─────────────────────────────────────────────────────

  describe('address search', () => {
    it('openAddressSearch sets editingField to address_search', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE });

      component.openAddressSearch();

      expect(component.editingField()).toBe('address_search');
    });

    it('applyAddressSuggestion updates image address fields', async () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.applyAddressSuggestion({
        lat: 47.07,
        lng: 15.44,
        addressLabel: 'Hauptplatz 1, Graz',
        street: 'Hauptplatz',
        city: 'Graz',
        district: 'Innere Stadt',
        country: 'Austria',
      });

      expect(component.image()!.street).toBe('Hauptplatz');
      expect(component.image()!.city).toBe('Graz');
      expect(component.image()!.address_label).toBe('Hauptplatz 1, Graz');
      expect(component.editingField()).toBeNull();
    });

    it('applyAddressSuggestion calls Supabase update', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.applyAddressSuggestion({
        lat: 47.07,
        lng: 15.44,
        addressLabel: 'Hauptplatz 1, Graz',
        street: 'Hauptplatz',
        city: 'Graz',
        district: 'Innere Stadt',
        country: 'Austria',
      });

      expect(fake.client.from).toHaveBeenCalledWith('images');
      expect(fake.updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          street: 'Hauptplatz',
          city: 'Graz',
          country: 'Austria',
          address_label: 'Hauptplatz 1, Graz',
        }),
      );
    });
  });

  // ── Captured date editor (DateSaveEvent + has_time) ────────────────────

  describe('captured date editor', () => {
    it('openCapturedAtEditor parses date and time when has_time=true', () => {
      const { component } = setup();
      component.image.set({
        ...MOCK_IMAGE,
        captured_at: '2025-06-15T10:30:00Z',
        has_time: true,
      });

      component.openCapturedAtEditor();

      expect(component.editingField()).toBe('captured_at');
      expect(component.editDate()).toBe('2025-06-15');
      expect(component.editTime()).toMatch(/^\d{2}:\d{2}$/);
    });

    it('openCapturedAtEditor sets empty time when has_time=false', () => {
      const { component } = setup();
      component.image.set({
        ...MOCK_IMAGE,
        captured_at: '2025-06-15T00:00:00Z',
        has_time: false,
      });

      component.openCapturedAtEditor();

      expect(component.editDate()).toBe('2025-06-15');
      expect(component.editTime()).toBe('');
    });

    it('openCapturedAtEditor sets empty fields when no captured_at', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, captured_at: null, has_time: false });

      component.openCapturedAtEditor();

      expect(component.editDate()).toBe('');
      expect(component.editTime()).toBe('');
      expect(component.editingField()).toBe('captured_at');
    });

    it('saveCapturedAt with date+time saves combined with has_time=true', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveCapturedAt({ date: '2025-07-20', time: '14:30' });

      const expectedIso = new Date('2025-07-20T14:30:00').toISOString();
      expect(fake.updateFn).toHaveBeenCalledWith({
        captured_at: expectedIso,
        has_time: true,
      });
      expect(component.image()!.has_time).toBe(true);
    });

    it('saveCapturedAt with date-only saves with has_time=false', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveCapturedAt({ date: '2025-07-20', time: null });

      const expectedIso = new Date('2025-07-20T00:00:00').toISOString();
      expect(fake.updateFn).toHaveBeenCalledWith({
        captured_at: expectedIso,
        has_time: false,
      });
      expect(component.image()!.has_time).toBe(false);
    });

    it('saveCapturedAt with 00:00 time saves with has_time=true', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveCapturedAt({ date: '2025-07-20', time: '00:00' });

      const expectedIso = new Date('2025-07-20T00:00:00').toISOString();
      expect(fake.updateFn).toHaveBeenCalledWith({
        captured_at: expectedIso,
        has_time: true,
      });
      expect(component.image()!.has_time).toBe(true);
    });

    it('saveCapturedAt with null date clears captured_at', async () => {
      const { component, fake } = setup();
      component.image.set({ ...MOCK_IMAGE });

      await component.saveCapturedAt({ date: null, time: null });

      expect(component.image()!.captured_at).toBeNull();
      expect(component.image()!.has_time).toBe(false);
      expect(fake.updateFn).toHaveBeenCalledWith({
        captured_at: null,
        has_time: false,
      });
    });

    it('saveCapturedAt closes editor', async () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE });
      component.editingField.set('captured_at');

      await component.saveCapturedAt({ date: '2025-07-20', time: '09:00' });

      expect(component.editingField()).toBeNull();
    });

    it('saveCapturedAt rolls back on Supabase error', async () => {
      const { component, fake } = setup();
      const original = '2025-06-15T10:30:00Z';
      component.image.set({ ...MOCK_IMAGE, captured_at: original, has_time: true });
      fake.updateEqFn.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await component.saveCapturedAt({ date: '2026-01-01', time: '08:00' });

      expect(component.image()!.captured_at).toBe(original);
      expect(component.image()!.has_time).toBe(true);
    });

    it('saveCapturedAt does nothing when image is null', async () => {
      const { component, fake } = setup();
      component.image.set(null);
      fake.client.from.mockClear();

      await component.saveCapturedAt({ date: '2025-07-20', time: '14:30' });

      expect(fake.updateFn).not.toHaveBeenCalled();
    });

    it('captureDate shows date+time when has_time=true', () => {
      const { component } = setup();
      component.image.set({
        ...MOCK_IMAGE,
        captured_at: '2025-06-15T10:30:00',
        has_time: true,
      });

      const display = component.captureDate();
      expect(display).toContain('2025');
      expect(display).toContain('10:30');
    });

    it('captureDate shows date-only when has_time=false', () => {
      const { component } = setup();
      component.image.set({
        ...MOCK_IMAGE,
        captured_at: '2025-06-15T00:00:00',
        has_time: false,
      });

      const display = component.captureDate();
      expect(display).toContain('2025');
      expect(display).not.toContain('00:00');
    });

    it('captureDate returns null when captured_at is null', () => {
      const { component } = setup();
      component.image.set({ ...MOCK_IMAGE, captured_at: null });
      expect(component.captureDate()).toBeNull();
    });
  });

  // ── onFullResLoaded ──────────────────────────────────────────────────────

  describe('onFullResLoaded', () => {
    it('sets fullResLoaded to true', () => {
      const { component } = setup();
      expect(component.fullResLoaded()).toBe(false);

      component.onFullResLoaded();

      expect(component.fullResLoaded()).toBe(true);
    });
  });

});

/**
 * UploadService unit tests.
 *
 * Strategy:
 *  - SupabaseService is replaced with a fake that mirrors the Supabase JS SDK
 *    call chains used by UploadService.
 *  - AuthService is replaced with a minimal fake exposing a user() signal.
 *  - exifr is vi.mock()'d so no real EXIF parsing occurs (no real files on disk).
 *  - No real HTTP / Storage calls are made.
 *  - Arrange–Act–Assert for every behavior; one it per behavior.
 */

import { TestBed } from '@angular/core/testing';
import { UploadService, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from './upload.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { GeocodingService } from './geocoding.service';

// ── Mock exifr ─────────────────────────────────────────────────────────────────
// Prevent any real EXIF / file parsing in the test environment.
vi.mock('exifr', () => ({
  gps: vi.fn(),
  parse: vi.fn(),
}));

import * as exifr from 'exifr';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFile(name = 'photo.jpg', type = 'image/jpeg', sizeBytes = 1024): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

/**
 * Builds a fake SupabaseService that covers the three call chains
 * UploadService uses:
 *   - client.from('profiles').select().eq().single()
 *   - client.storage.from('images').upload()
 *   - client.from('images').insert().select().single()
 */
function buildFakeSupabase(
  overrides: {
    profileResult?: object;
    storageUploadResult?: object;
    insertResult?: object;
    signedUrlResult?: object;
  } = {},
) {
  const profileResult = overrides.profileResult ?? {
    data: { organization_id: 'org-uuid' },
    error: null,
  };
  const storageUploadResult = overrides.storageUploadResult ?? { error: null };
  const insertResult = overrides.insertResult ?? { data: { id: 'img-uuid' }, error: null };
  const signedUrlResult = overrides.signedUrlResult ?? {
    data: { signedUrl: 'https://signed.example/img' },
    error: null,
  };

  // Capture the last from() call so tests can inspect calls if needed.
  const profileChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(profileResult),
  };

  const imagesInsertChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(insertResult),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  const storageFromChain = {
    upload: vi.fn().mockResolvedValue(storageUploadResult),
    createSignedUrl: vi.fn().mockResolvedValue(signedUrlResult),
  };

  return {
    _profileChain: profileChain,
    _imagesInsertChain: imagesInsertChain,
    _storageFromChain: storageFromChain,
    client: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') return profileChain;
        if (table === 'images') return imagesInsertChain;
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
      storage: {
        from: vi.fn().mockReturnValue(storageFromChain),
      },
    },
  };
}

function buildFakeAuth(userId: string | null = 'user-uuid') {
  return {
    user: vi.fn().mockReturnValue(userId ? { id: userId, email: 'test@example.com' } : null),
  };
}

function buildFakeGeocoding(
  result: object | null = {
    addressLabel: 'Burgstraße 7, 8001 Zürich, Switzerland',
    city: 'Zürich',
    district: 'Altstadt',
    street: 'Burgstraße 7',
    country: 'Switzerland',
  },
) {
  return {
    reverse: vi.fn().mockResolvedValue(result),
  };
}

function setup(
  supabaseOverrides: Parameters<typeof buildFakeSupabase>[0] = {},
  userId: string | null = 'user-uuid',
  geocodingResult?: object | null,
) {
  const fakeSupabase = buildFakeSupabase(supabaseOverrides);
  const fakeAuth = buildFakeAuth(userId);
  const fakeGeocoding = buildFakeGeocoding(geocodingResult);

  TestBed.configureTestingModule({
    providers: [
      UploadService,
      { provide: SupabaseService, useValue: fakeSupabase },
      { provide: AuthService, useValue: fakeAuth },
      { provide: GeocodingService, useValue: fakeGeocoding },
    ],
  });

  const service = TestBed.inject(UploadService);
  return { service, fakeSupabase, fakeAuth, fakeGeocoding };
}

// ── Test suites ────────────────────────────────────────────────────────────────

describe('UploadService', () => {
  // ── validateFile() ─────────────────────────────────────────────────────────

  describe('validateFile()', () => {
    it('rejects a file that exceeds 25 MB', () => {
      const { service } = setup();
      const bigFile = makeFile('big.jpg', 'image/jpeg', MAX_FILE_SIZE + 1);

      const result = service.validateFile(bigFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('25 MB');
    });

    it('rejects a file with an unsupported MIME type', () => {
      const { service } = setup();
      const gifFile = makeFile('anim.gif', 'image/gif', 512);

      const result = service.validateFile(gifFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('image/gif');
    });

    it('accepts a valid JPEG within size limit', () => {
      const { service } = setup();
      const file = makeFile('photo.jpg', 'image/jpeg', 1024);

      const result = service.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts a valid PNG', () => {
      const { service } = setup();
      const file = makeFile('diagram.png', 'image/png', 2048);

      const result = service.validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('accepts HEIC files', () => {
      const { service } = setup();
      const file = makeFile('iphone.heic', 'image/heic', 4096);

      const result = service.validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('accepts WebP files', () => {
      const { service } = setup();
      const file = makeFile('photo.webp', 'image/webp', 512);

      const result = service.validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('accepts a file at exactly the 25 MB limit', () => {
      const { service } = setup();
      const file = makeFile('exact.jpg', 'image/jpeg', MAX_FILE_SIZE);

      const result = service.validateFile(file);

      expect(result.valid).toBe(true);
    });

    it('ALLOWED_MIME_TYPES covers jpeg, png, heic, heif, webp', () => {
      expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('image/heic')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('image/heif')).toBe(true);
      expect(ALLOWED_MIME_TYPES.has('image/webp')).toBe(true);
    });
  });

  // ── parseExif() ────────────────────────────────────────────────────────────

  describe('parseExif()', () => {
    it('returns coordinates when GPS tags are present', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 37.7749, longitude: -122.4194 });
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2025-06-01') });

      const { service } = setup();
      const file = makeFile();

      const result = await service.parseExif(file);

      expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
      expect(result.capturedAt).toEqual(new Date('2025-06-01'));
    });

    it('returns undefined coords when GPS data is absent', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.coords).toBeUndefined();
    });

    it('returns empty object when exifr throws', async () => {
      vi.mocked(exifr.gps).mockRejectedValue(new Error('parse error'));
      vi.mocked(exifr.parse).mockRejectedValue(new Error('parse error') as any);

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result).toEqual({});
    });

    it('returns undefined coords when GPS latitude is null', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: null, longitude: null } as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.coords).toBeUndefined();
    });

    it('returns direction when GPSImgDirection is present', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 37.7, longitude: -122.4 });
      vi.mocked(exifr.parse).mockResolvedValue({
        DateTimeOriginal: new Date('2025-06-01'),
        GPSImgDirection: 127.5,
      });

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.direction).toBe(127.5);
    });

    it('returns undefined direction when GPSImgDirection is absent', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 37.7, longitude: -122.4 });
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2025-06-01') });

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.direction).toBeUndefined();
    });

    it('rejects direction outside 0–360 range', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 37.7, longitude: -122.4 });
      vi.mocked(exifr.parse).mockResolvedValue({ GPSImgDirection: 400 });

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.direction).toBeUndefined();
    });

    it('rejects non-numeric direction values', async () => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 37.7, longitude: -122.4 });
      vi.mocked(exifr.parse).mockResolvedValue({ GPSImgDirection: 'NNW' });

      const { service } = setup();
      const result = await service.parseExif(makeFile());

      expect(result.direction).toBeUndefined();
    });
  });

  // ── uploadFile() ───────────────────────────────────────────────────────────

  describe('uploadFile()', () => {
    beforeEach(() => {
      // Default: EXIF has GPS data
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 51.5074, longitude: -0.1278 });
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2025-01-10') });
    });

    it('returns an error when the user is not authenticated', async () => {
      const { service } = setup({}, null);

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeTruthy();
    });

    it('returns an error when the file fails validation', async () => {
      const { service } = setup();
      const badFile = makeFile('x.gif', 'image/gif', 100);

      const result = await service.uploadFile(badFile);

      expect(result.error).toBeTruthy();
      expect(typeof result.error === 'string' ? result.error : '').toContain('image/gif');
    });

    it('returns an error when profile fetch fails', async () => {
      const { service } = setup({
        profileResult: { data: null, error: new Error('profile not found') },
      });

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeTruthy();
    });

    it('returns an error when storage upload fails', async () => {
      const { service } = setup({
        storageUploadResult: { error: new Error('storage error') },
      });

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeTruthy();
    });

    it('maps bucket-not-found storage errors to an actionable message', async () => {
      const { service } = setup({
        storageUploadResult: { error: { message: 'Bucket not found' } },
      });

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBe(
        'Storage bucket "images" is missing in this Supabase project. Create it (or run the storage migration) and retry.',
      );
    });

    it('returns an error when the DB insert fails', async () => {
      const { service } = setup({
        insertResult: { data: null, error: new Error('db error') },
      });

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeTruthy();
    });

    it('returns id and coords on a successful upload with EXIF GPS', async () => {
      const { service } = setup();

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeNull();
      if (result.error === null) {
        expect(result.id).toBe('img-uuid');
        expect(result.coords).toEqual({ lat: 51.5074, lng: -0.1278 });
      }
    });

    it('persists EXIF lat/lng in both exif_ columns and mutable columns', async () => {
      const { service, fakeSupabase } = setup();

      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.exif_latitude).toBe(51.5074);
      expect(insertCall.exif_longitude).toBe(-0.1278);
      expect(insertCall.latitude).toBe(51.5074);
      expect(insertCall.longitude).toBe(-0.1278);
    });

    it('sets null coords in DB when no EXIF GPS and no manual coords provided', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeSupabase } = setup();

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeNull();
      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.exif_latitude).toBeNull();
      expect(insertCall.latitude).toBeNull();
    });

    it('uses manual coords for latitude/longitude when EXIF is absent', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeSupabase } = setup();
      const manualCoords = { lat: 48.8566, lng: 2.3522 };

      const result = await service.uploadFile(makeFile(), manualCoords);

      expect(result.error).toBeNull();
      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.exif_latitude).toBeNull(); // no EXIF
      expect(insertCall.latitude).toBe(48.8566); // manual
      expect(insertCall.longitude).toBe(2.3522);
    });

    it('builds the storage path using org_id / user_id segments', async () => {
      const { service, fakeSupabase } = setup();

      await service.uploadFile(makeFile('shot.jpg', 'image/jpeg'));

      const uploadCall = fakeSupabase._storageFromChain.upload.mock.calls[0];
      const storagePath: string = uploadCall[0];
      expect(storagePath.startsWith('org-uuid/user-uuid/')).toBe(true);
      expect(storagePath.endsWith('.jpg')).toBe(true);
    });

    it('inserts captured_at from EXIF DateTimeOriginal', async () => {
      const capturedAt = new Date('2025-01-10');
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: capturedAt });

      const { service, fakeSupabase } = setup();
      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.captured_at).toEqual(capturedAt);
    });

    it('inserts null captured_at when EXIF has no DateTimeOriginal', async () => {
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeSupabase } = setup();
      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.captured_at).toBeNull();
    });

    it('inserts direction when EXIF GPSImgDirection is present', async () => {
      vi.mocked(exifr.parse).mockResolvedValue({
        DateTimeOriginal: new Date('2025-01-10'),
        GPSImgDirection: 245.3,
      });

      const { service, fakeSupabase } = setup();
      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.direction).toBe(245.3);
    });

    it('inserts null direction when EXIF has no GPSImgDirection', async () => {
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2025-01-10') });

      const { service, fakeSupabase } = setup();
      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.direction).toBeNull();
    });

    it('includes direction in successful upload result', async () => {
      vi.mocked(exifr.parse).mockResolvedValue({
        DateTimeOriginal: new Date('2025-01-10'),
        GPSImgDirection: 90,
      });

      const { service } = setup();
      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeNull();
      if (result.error === null) {
        expect(result.direction).toBe(90);
      }
    });
  });

  // ── getSignedUrl() ─────────────────────────────────────────────────────────

  describe('getSignedUrl()', () => {
    it('returns a signed URL on success', async () => {
      const { service } = setup();

      const result = await service.getSignedUrl('org-uuid/user-uuid/abc.jpg');

      if (result.error === null) {
        expect(result.url).toBe('https://signed.example/img');
      } else {
        throw new Error('Expected success');
      }
    });

    it('returns an error when createSignedUrl fails', async () => {
      const { service } = setup({
        signedUrlResult: { data: null, error: new Error('signed url error') },
      });

      const result = await service.getSignedUrl('org-uuid/user-uuid/abc.jpg');

      expect(result.error).toBeTruthy();
    });
  });

  // ── Address resolution after upload ────────────────────────────────────────

  describe('address resolution after upload', () => {
    beforeEach(() => {
      vi.mocked(exifr.gps).mockResolvedValue({ latitude: 47.3769, longitude: 8.5417 });
      vi.mocked(exifr.parse).mockResolvedValue({ DateTimeOriginal: new Date('2025-06-01') });
    });

    it('calls GeocodingService.reverse() with EXIF coordinates after successful upload', async () => {
      const { service, fakeGeocoding } = setup();

      await service.uploadFile(makeFile());
      // Allow the fire-and-forget to complete.
      await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());

      expect(fakeGeocoding.reverse).toHaveBeenCalledWith(47.3769, 8.5417);
    });

it('updates the DB row with resolved address fields via RPC', async () => {
            const { service, fakeSupabase, fakeGeocoding } = setup();

            await service.uploadFile(makeFile());
            await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());

            const rpcCall = fakeSupabase.client.rpc.mock.calls.find(
                (c: string[]) => c[0] === 'bulk_update_image_addresses',
            )!;
            expect(rpcCall).toBeDefined();
            expect(rpcCall[1]).toMatchObject({
                p_image_ids: ['img-uuid'],
                p_address_label: 'Burgstraße 7, 8001 Zürich, Switzerland',
                p_city: 'Zürich',
                p_district: 'Altstadt',
                p_street: 'Burgstraße 7',
                p_country: 'Switzerland',
      });
    });

    it('does not call reverse geocode when image has no coordinates', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeGeocoding } = setup();

      await service.uploadFile(makeFile());
      // Give time for any async work to settle.
      await new Promise((r) => setTimeout(r, 50));

      expect(fakeGeocoding.reverse).not.toHaveBeenCalled();
    });

    it('does not fail the upload when geocoding returns null', async () => {
      const { service } = setup({}, 'user-uuid', null);

      const result = await service.uploadFile(makeFile());

      expect(result.error).toBeNull();
    });

    it('sets location_unresolved to true on insert when coordinates are present', async () => {
      const { service, fakeSupabase } = setup();

      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      expect(insertCall.location_unresolved).toBe(true);
    });

    it('sets location_unresolved to false (null coords) when no GPS or manual coords', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeSupabase } = setup();

      await service.uploadFile(makeFile());

      const insertCall = fakeSupabase._imagesInsertChain.insert.mock.calls[0][0];
      // No coordinates → location_unresolved should be false (nothing to resolve)
      expect(insertCall.location_unresolved).toBe(false);
    });

    it('calls reverse geocode with manual coords when EXIF GPS is absent', async () => {
      vi.mocked(exifr.gps).mockResolvedValue(null as any);
      vi.mocked(exifr.parse).mockResolvedValue(null as any);

      const { service, fakeGeocoding } = setup();

      await service.uploadFile(makeFile(), { lat: 48.8566, lng: 2.3522 });
      await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());

      expect(fakeGeocoding.reverse).toHaveBeenCalledWith(48.8566, 2.3522);
    });
  });
});

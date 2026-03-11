/**
 * PhotoViewerComponent — unit tests.
 *
 * Covers:
 *  - Progressive image loading (placeholder → thumbnail → full-res)
 *  - Lightbox open/close behavior
 *  - Replace photo flow (delegates to UploadManagerService)
 *  - Attach photo flow (photoless datapoints)
 *  - File validation
 *  - Grid cache updates via WorkspaceViewService
 *  - Blob URL cleanup
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ComponentRef, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PhotoViewerComponent } from './photo-viewer.component';
import { SupabaseService } from '../../../../core/supabase.service';
import { UploadService } from '../../../../core/upload.service';
import {
  UploadManagerService,
  ImageReplacedEvent,
  ImageAttachedEvent,
} from '../../../../core/upload-manager.service';
import { WorkspaceViewService } from '../../../../core/workspace-view.service';

// ── Test data ──────────────────────────────────────────────────────────────

const IMAGE_ID = 'img-001';
const STORAGE_PATH = 'org-001/user-001/photo.jpg';
const THUMBNAIL_PATH = 'org-001/user-001/photo_thumb.jpg';

// ── Setup helper ───────────────────────────────────────────────────────────

function setup(opts: { storagePath?: string | null; thumbnailPath?: string | null } = {}) {
  const imageReplaced$ = new Subject<ImageReplacedEvent>();
  const imageAttached$ = new Subject<ImageAttachedEvent>();

  const createSignedUrlFn = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://example.com/signed' },
    error: null,
  });

  const fakeSupabase = {
    client: {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: createSignedUrlFn,
        }),
      },
    },
  };

  const fakeUploadService = {
    validateFile: vi.fn().mockReturnValue({ valid: true }),
  };

  const fakeUploadManager = {
    replaceFile: vi.fn().mockReturnValue('job-001'),
    attachFile: vi.fn().mockReturnValue('job-002'),
    imageReplaced$: imageReplaced$.asObservable(),
    imageAttached$: imageAttached$.asObservable(),
    jobs: signal([]),
  };

  const fakeWorkspaceView = {
    rawImages: signal([
      {
        id: IMAGE_ID,
        storagePath: STORAGE_PATH,
        thumbnailPath: THUMBNAIL_PATH,
        signedThumbnailUrl: 'https://example.com/old-thumb',
        thumbnailUnavailable: false,
        latitude: 48.2082,
        longitude: 16.3738,
        capturedAt: '2025-06-15T10:30:00Z',
        createdAt: '2025-06-15T12:00:00Z',
        projectId: 'proj-001',
        projectName: 'Project Alpha',
        direction: 180,
        exifLatitude: 48.2082,
        exifLongitude: 16.3738,
        addressLabel: 'Stephansplatz 1, Wien',
        city: 'Wien',
        district: 'Innere Stadt',
        street: 'Stephansplatz',
        country: 'Austria',
        userName: null,
      },
    ]),
    batchSignThumbnails: vi.fn().mockResolvedValue(undefined),
  };

  TestBed.configureTestingModule({
    imports: [PhotoViewerComponent],
    providers: [
      { provide: SupabaseService, useValue: fakeSupabase },
      { provide: UploadService, useValue: fakeUploadService },
      { provide: UploadManagerService, useValue: fakeUploadManager },
      { provide: WorkspaceViewService, useValue: fakeWorkspaceView },
    ],
  });

  const fixture = TestBed.createComponent(PhotoViewerComponent);
  const component = fixture.componentInstance;
  const ref = fixture.componentRef as ComponentRef<PhotoViewerComponent>;

  ref.setInput('imageId', IMAGE_ID);
  ref.setInput('storagePath', opts.storagePath !== undefined ? opts.storagePath : STORAGE_PATH);
  ref.setInput('thumbnailPath', opts.thumbnailPath !== undefined ? opts.thumbnailPath : THUMBNAIL_PATH);
  ref.setInput('displayTitle', 'Test Photo');

  fixture.detectChanges();

  return {
    fixture,
    component,
    ref,
    fakeSupabase,
    fakeUploadService,
    fakeUploadManager,
    fakeWorkspaceView,
    createSignedUrlFn,
    imageReplaced$,
    imageAttached$,
  };
}

/** Creates a minimal File object for testing. */
function createTestFile(name = 'replacement.jpg', type = 'image/jpeg', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

/** Builds a fake input change Event carrying a File. */
function createFileEvent(file: File): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file], writable: false });
  return { target: input } as unknown as Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PhotoViewerComponent', () => {
  // ── Progressive loading ──

  describe('progressive image loading', () => {
    it('starts with loading state when storagePath is set', () => {
      const { component } = setup();
      expect(component.isLoading()).toBe(true);
      expect(component.imageReady()).toBe(false);
    });

    it('requests signed URLs from storage on init', async () => {
      const { fakeSupabase, createSignedUrlFn } = setup();

      await vi.waitFor(() => {
        expect(fakeSupabase.client.storage.from).toHaveBeenCalledWith('images');
        expect(createSignedUrlFn).toHaveBeenCalled();
      });
    });

    it('sets thumbLoaded when onThumbnailLoaded is called', () => {
      const { component } = setup();
      expect(component.thumbLoaded()).toBe(false);

      component.onThumbnailLoaded();

      expect(component.thumbLoaded()).toBe(true);
      expect(component.imageReady()).toBe(true);
    });

    it('sets fullResLoaded when onFullResLoaded is called', () => {
      const { component } = setup();
      expect(component.fullResLoaded()).toBe(false);

      component.onFullResLoaded();

      expect(component.fullResLoaded()).toBe(true);
      expect(component.imageReady()).toBe(true);
    });

    it('imageReady stays true after thumbnail loads even if full-res has not loaded', () => {
      const { component } = setup();
      component.onThumbnailLoaded();

      expect(component.imageReady()).toBe(true);
      expect(component.fullResLoaded()).toBe(false);
    });

    it('sets imageErrored on image error', () => {
      const { component } = setup();
      component.onImageError();

      expect(component.imageErrored()).toBe(true);
      expect(component.isLoading()).toBe(false);
    });

    it('hasPhoto is true when storagePath is provided', () => {
      const { component } = setup();
      expect(component.hasPhoto()).toBe(true);
    });

    it('hasPhoto is false when storagePath is null', () => {
      const { component } = setup({ storagePath: null });
      expect(component.hasPhoto()).toBe(false);
    });

    it('isLoading is false immediately when storagePath is null', () => {
      const { component } = setup({ storagePath: null });
      expect(component.isLoading()).toBe(false);
    });

    it('urlsResolved is true immediately when storagePath is null', () => {
      const { component } = setup({ storagePath: null });
      expect(component.urlsResolved()).toBe(true);
    });

    it('urlsResolved becomes true after signed URLs resolve', async () => {
      const { component } = setup();
      // Initially false while URLs are being fetched
      expect(component.urlsResolved()).toBe(false);

      await vi.waitFor(() => {
        expect(component.urlsResolved()).toBe(true);
      });
    });

    it('stops loading when both URLs fail', async () => {
      const { component, ref, fixture, createSignedUrlFn } = setup();

      // Wait for initial successful URL resolution
      await vi.waitFor(() => {
        expect(component.urlsResolved()).toBe(true);
      });

      // Now make URLs fail and trigger a new storagePath change
      createSignedUrlFn.mockResolvedValue({ data: null, error: { message: 'not found' } });
      ref.setInput('storagePath', 'org-001/user-001/missing.jpg');
      fixture.detectChanges();

      await vi.waitFor(() => {
        expect(component.urlsResolved()).toBe(true);
      });

      expect(component.isLoading()).toBe(false);
      expect(component.imageErrored()).toBe(true);
    });
  });

  // ── Lightbox ──

  describe('lightbox', () => {
    it('opens lightbox when imageReady is true', () => {
      const { component } = setup();
      component.onThumbnailLoaded();

      component.openLightbox();

      expect(component.lightboxOpen()).toBe(true);
    });

    it('does not open lightbox when image is not ready', () => {
      const { component } = setup();
      component.openLightbox();

      expect(component.lightboxOpen()).toBe(false);
    });

    it('closes lightbox', () => {
      const { component } = setup();
      component.onThumbnailLoaded();
      component.openLightbox();

      component.closeLightbox();

      expect(component.lightboxOpen()).toBe(false);
    });
  });

  // ── Replace Photo ──

  describe('replace photo', () => {
    it('delegates to uploadManager.replaceFile when photo exists', () => {
      const { component, fakeUploadManager } = setup();
      const file = createTestFile();

      component.onFileSelected(createFileEvent(file));

      expect(fakeUploadManager.replaceFile).toHaveBeenCalledWith(IMAGE_ID, file);
      expect(component.replacing()).toBe(true);
    });

    it('validates file before replacing', () => {
      const { component, fakeUploadService, fakeUploadManager } = setup();
      fakeUploadService.validateFile.mockReturnValueOnce({
        valid: false,
        error: 'File too large',
      });

      component.onFileSelected(createFileEvent(createTestFile()));

      expect(component.replaceError()).toBe('File too large');
      expect(component.replacing()).toBe(false);
      expect(fakeUploadManager.replaceFile).not.toHaveBeenCalled();
    });

    it('clears previous replaceError on new attempt', () => {
      const { component } = setup();
      component.replaceError.set('Previous error');

      component.onFileSelected(createFileEvent(createTestFile()));

      expect(component.replaceError()).toBeNull();
    });

    it('does nothing when no file is selected', () => {
      const { component, fakeUploadManager } = setup();
      const input = document.createElement('input');
      input.type = 'file';

      component.onFileSelected({ target: input } as unknown as Event);

      expect(fakeUploadManager.replaceFile).not.toHaveBeenCalled();
      expect(component.replacing()).toBe(false);
    });

    it('does nothing when imageId is null', () => {
      const { component, ref, fixture, fakeUploadManager } = setup();
      ref.setInput('imageId', null);
      fixture.detectChanges();

      component.onFileSelected(createFileEvent(createTestFile()));

      expect(fakeUploadManager.replaceFile).not.toHaveBeenCalled();
    });
  });

  // ── Attach Photo (photoless datapoint) ──

  describe('attach photo', () => {
    it('delegates to uploadManager.attachFile when no photo exists', () => {
      const { component, fakeUploadManager } = setup({ storagePath: null });
      const file = createTestFile();

      component.onFileSelected(createFileEvent(file));

      expect(fakeUploadManager.attachFile).toHaveBeenCalledWith(IMAGE_ID, file);
      expect(component.replacing()).toBe(true);
    });
  });

  // ── imageReplaced$ handling ──

  describe('imageReplaced$ subscription', () => {
    it('resets replacing state and emits photoReplaced', () => {
      const { component, imageReplaced$ } = setup();
      component.replacing.set(true);

      const emitted: ImageReplacedEvent[] = [];
      component.photoReplaced.subscribe((e) => emitted.push(e));

      const event: ImageReplacedEvent = {
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new-photo.jpg',
        localObjectUrl: 'blob:http://localhost/abc',
      };
      imageReplaced$.next(event);

      expect(component.replacing()).toBe(false);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual(event);
    });

    it('sets heroSrc to localObjectUrl for instant swap', () => {
      const { component, imageReplaced$ } = setup();

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
        localObjectUrl: 'blob:http://localhost/abc',
      });

      expect(component.heroSrc()).toBe('blob:http://localhost/abc');
    });

    it('clears heroSrc when full-res loads after replace', () => {
      const { component, imageReplaced$ } = setup();

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
        localObjectUrl: 'blob:http://localhost/abc',
      });

      expect(component.heroSrc()).toBe('blob:http://localhost/abc');

      component.onFullResLoaded();

      expect(component.heroSrc()).toBeNull();
    });

    it('resets loading state for progressive reload', () => {
      const { component, imageReplaced$ } = setup();
      component.fullResLoaded.set(true);
      component.thumbLoaded.set(true);

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
      });

      expect(component.fullResLoaded()).toBe(false);
      expect(component.thumbLoaded()).toBe(false);
    });

    it('ignores events for different imageIds', () => {
      const { component, imageReplaced$ } = setup();
      component.replacing.set(true);

      imageReplaced$.next({
        jobId: 'job-999',
        imageId: 'other-image',
        newStoragePath: 'org-001/other.jpg',
      });

      expect(component.replacing()).toBe(true); // unchanged
    });

    it('updates grid cache and re-signs thumbnails', () => {
      const { component, imageReplaced$, fakeWorkspaceView } = setup();

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
      });

      const gridImage = fakeWorkspaceView.rawImages().find((wi) => wi.id === IMAGE_ID);
      expect(gridImage?.storagePath).toBe('org-001/user-001/new.jpg');
      expect(gridImage?.thumbnailPath).toBeNull();
      expect(gridImage?.signedThumbnailUrl).toBeUndefined();
      expect(fakeWorkspaceView.batchSignThumbnails).toHaveBeenCalled();
    });
  });

  // ── imageAttached$ handling ──

  describe('imageAttached$ subscription', () => {
    it('resets replacing state and emits photoAttached', () => {
      const { component, imageAttached$ } = setup({ storagePath: null });
      component.replacing.set(true);

      const emitted: ImageAttachedEvent[] = [];
      component.photoAttached.subscribe((e) => emitted.push(e));

      const event: ImageAttachedEvent = {
        jobId: 'job-002',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/attached.jpg',
        localObjectUrl: 'blob:http://localhost/def',
        hadExistingCoords: true,
      };
      imageAttached$.next(event);

      expect(component.replacing()).toBe(false);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual(event);
    });

    it('sets heroSrc from localObjectUrl', () => {
      const { component, imageAttached$ } = setup({ storagePath: null });

      imageAttached$.next({
        jobId: 'job-002',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/attached.jpg',
        localObjectUrl: 'blob:http://localhost/def',
        hadExistingCoords: false,
      });

      expect(component.heroSrc()).toBe('blob:http://localhost/def');
    });

    it('ignores events for different imageIds', () => {
      const { component, imageAttached$ } = setup({ storagePath: null });
      component.replacing.set(true);

      imageAttached$.next({
        jobId: 'job-999',
        imageId: 'other-image',
        newStoragePath: 'org-001/other.jpg',
        hadExistingCoords: false,
      });

      expect(component.replacing()).toBe(true); // unchanged
    });
  });

  // ── Blob URL cleanup ──

  describe('blob URL cleanup', () => {
    it('revokes blob URL on destroy', () => {
      const { component, imageReplaced$, fixture } = setup();
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
        localObjectUrl: 'blob:http://localhost/abc',
      });

      fixture.destroy();

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/abc');
      revokeSpy.mockRestore();
    });

    it('revokes blob URL when full-res loads', () => {
      const { component, imageReplaced$ } = setup();
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      imageReplaced$.next({
        jobId: 'job-001',
        imageId: IMAGE_ID,
        newStoragePath: 'org-001/user-001/new.jpg',
        localObjectUrl: 'blob:http://localhost/xyz',
      });

      component.onFullResLoaded();

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/xyz');
      revokeSpy.mockRestore();
    });
  });
});

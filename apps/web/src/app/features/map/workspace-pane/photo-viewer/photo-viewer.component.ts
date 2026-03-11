import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PhotoLightboxComponent } from '../../../../shared/photo-lightbox/photo-lightbox.component';
import { SupabaseService } from '../../../../core/supabase.service';
import { UploadService, ALLOWED_MIME_TYPES } from '../../../../core/upload.service';
import {
  UploadManagerService,
  ImageReplacedEvent,
  ImageAttachedEvent,
  UploadJob,
} from '../../../../core/upload-manager.service';
import { WorkspaceViewService } from '../../../../core/workspace-view.service';

@Component({
  selector: 'app-photo-viewer',
  standalone: true,
  imports: [PhotoLightboxComponent],
  templateUrl: './photo-viewer.component.html',
  styleUrl: './photo-viewer.component.scss',
})
export class PhotoViewerComponent implements OnDestroy {
  private readonly supabaseService = inject(SupabaseService);
  private readonly uploadService = inject(UploadService);
  private readonly uploadManager = inject(UploadManagerService);
  private readonly workspaceView = inject(WorkspaceViewService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs ──

  readonly imageId = input<string | null>(null);
  readonly storagePath = input<string | null>(null);
  readonly thumbnailPath = input<string | null>(null);
  readonly displayTitle = input<string>('Photo');

  // ── Outputs ──

  readonly photoReplaced = output<ImageReplacedEvent>();
  readonly photoAttached = output<ImageAttachedEvent>();

  // ── State (per spec) ──

  readonly fullResLoaded = signal(false);
  readonly thumbLoaded = signal(false);
  readonly lightboxOpen = signal(false);
  readonly replacing = signal(false);
  readonly replaceError = signal<string | null>(null);
  readonly heroSrc = signal<string | null>(null);

  // ── Internal signed URL state ──

  readonly thumbnailUrl = signal<string | null>(null);
  readonly fullResUrl = signal<string | null>(null);
  readonly imageErrored = signal(false);

  /** Set to true once loadSignedUrls completes (success or failure). */
  readonly urlsResolved = signal(false);

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Tracks the active replace/attach job ID for progress monitoring. */
  private activeJobId: string | null = null;

  /** Blob URL pending revocation after full-res loads. */
  private pendingBlobUrl: string | null = null;

  // ── Computed ──

  readonly hasPhoto = computed(() => !!this.storagePath());

  readonly isLoading = computed(() => {
    if (!this.hasPhoto()) return false;
    if (this.imageErrored()) return false;
    if (this.heroSrc()) return false;
    if (!this.urlsResolved()) return true;
    if (this.thumbnailUrl() && !this.thumbLoaded() && !this.fullResLoaded()) return true;
    return false;
  });

  readonly imageReady = computed(() => {
    if (this.heroSrc()) return true;
    if (this.fullResLoaded()) return true;
    if (this.thumbLoaded()) return true;
    return false;
  });

  /** The active upload job (for progress display). */
  readonly activeJob = computed<UploadJob | undefined>(() => {
    const id = this.activeJobId;
    if (!id) return undefined;
    return this.uploadManager.jobs().find((j) => j.id === id);
  });

  readonly acceptTypes = Array.from(ALLOWED_MIME_TYPES).join(',');

  constructor() {
    // Load signed URLs when storagePath changes
    effect(() => {
      const sp = this.storagePath();
      const tp = this.thumbnailPath();

      this.fullResLoaded.set(false);
      this.thumbLoaded.set(false);
      this.imageErrored.set(false);
      this.urlsResolved.set(false);
      this.thumbnailUrl.set(null);
      this.fullResUrl.set(null);

      // Don't clear heroSrc here — it may be showing a blob URL from a just-completed replace.
      // It will be cleared naturally when the new signed URLs load.

      if (sp) {
        this.loadSignedUrls(sp, tp);
      } else {
        this.urlsResolved.set(true);
      }
    });

    // Subscribe to imageReplaced$
    this.uploadManager.imageReplaced$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.imageId !== this.imageId()) return;
        this.handleReplaced(event);
      });

    // Subscribe to imageAttached$
    this.uploadManager.imageAttached$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.imageId !== this.imageId()) return;
        this.handleAttached(event);
      });
  }

  ngOnDestroy(): void {
    this.revokePendingBlob();
  }

  // ── Image load callbacks ──

  onThumbnailLoaded(): void {
    this.thumbLoaded.set(true);
  }

  onThumbnailError(): void {
    this.thumbLoaded.set(false);
  }

  onFullResLoaded(): void {
    this.fullResLoaded.set(true);
    // Clear heroSrc (blob URL) now that the real image is loaded
    if (this.heroSrc()) {
      this.heroSrc.set(null);
    }
    this.revokePendingBlob();
  }

  onImageError(): void {
    this.imageErrored.set(true);
  }

  // ── Lightbox ──

  openLightbox(): void {
    if (this.imageReady()) {
      this.lightboxOpen.set(true);
    }
  }

  closeLightbox(): void {
    this.lightboxOpen.set(false);
  }

  // ── Replace Photo ──

  triggerFileInput(): void {
    const el = this.fileInput()?.nativeElement;
    if (el) {
      el.value = '';
      el.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const id = this.imageId();
    if (!id) return;

    // Validate
    const validation = this.uploadService.validateFile(file);
    if (!validation.valid) {
      this.replaceError.set(validation.error!);
      return;
    }

    this.replaceError.set(null);
    this.replacing.set(true);

    if (this.hasPhoto()) {
      // Replace existing photo
      this.activeJobId = this.uploadManager.replaceFile(id, file);
    } else {
      // Attach photo to photoless datapoint
      this.activeJobId = this.uploadManager.attachFile(id, file);
    }
  }

  // ── Event handlers ──

  private handleReplaced(event: ImageReplacedEvent): void {
    this.replacing.set(false);
    this.activeJobId = null;

    // Instant swap: show blob URL immediately
    if (event.localObjectUrl) {
      this.pendingBlobUrl = event.localObjectUrl;
      this.heroSrc.set(event.localObjectUrl);
    }

    // Reset loading state for progressive reload
    this.fullResLoaded.set(false);
    this.thumbLoaded.set(false);
    this.imageErrored.set(false);
    this.urlsResolved.set(false);
    this.thumbnailUrl.set(null);
    this.fullResUrl.set(null);

    // Load new signed URLs
    this.loadSignedUrls(event.newStoragePath, null);

    // Update workspace grid cache
    this.updateGridCache(event.imageId, event.newStoragePath);

    // Notify parent
    this.photoReplaced.emit(event);
  }

  private handleAttached(event: ImageAttachedEvent): void {
    this.replacing.set(false);
    this.activeJobId = null;

    // Instant swap: show blob URL
    if (event.localObjectUrl) {
      this.pendingBlobUrl = event.localObjectUrl;
      this.heroSrc.set(event.localObjectUrl);
    }

    // Reset and reload signed URLs
    this.fullResLoaded.set(false);
    this.thumbLoaded.set(false);
    this.imageErrored.set(false);
    this.urlsResolved.set(false);
    this.thumbnailUrl.set(null);
    this.fullResUrl.set(null);

    this.loadSignedUrls(event.newStoragePath, null);

    // Update workspace grid cache
    this.updateGridCache(event.imageId, event.newStoragePath);

    // Notify parent
    this.photoAttached.emit(event);
  }

  // ── Internal helpers ──

  private async loadSignedUrls(storagePath: string, thumbnailPath: string | null): Promise<void> {
    const thumbPromise = thumbnailPath
      ? this.supabaseService.client.storage.from('images').createSignedUrl(thumbnailPath, 3600)
      : this.supabaseService.client.storage.from('images').createSignedUrl(storagePath, 3600, {
          transform: { width: 256, height: 256, resize: 'cover', quality: 60 },
        });

    const fullPromise = this.supabaseService.client.storage
      .from('images')
      .createSignedUrl(storagePath, 3600);

    const [thumbResult, fullResult] = await Promise.allSettled([thumbPromise, fullPromise]);

    this.thumbnailUrl.set(this.extractSignedUrl(thumbResult));
    this.fullResUrl.set(this.extractSignedUrl(fullResult));
    this.urlsResolved.set(true);

    // If both URLs failed, mark as errored so placeholder shows broken state
    if (!this.thumbnailUrl() && !this.fullResUrl()) {
      this.imageErrored.set(true);
    }
  }

  private extractSignedUrl(
    settled: PromiseSettledResult<{ data: { signedUrl: string } | null; error: any }>,
  ): string | null {
    if (settled.status !== 'fulfilled') return null;
    const result = settled.value;
    if (!result || result.error) return null;
    return result.data?.signedUrl ?? null;
  }

  private updateGridCache(imageId: string, newStoragePath: string): void {
    this.workspaceView.rawImages.update((all) =>
      all.map((wi) =>
        wi.id === imageId
          ? {
              ...wi,
              storagePath: newStoragePath,
              thumbnailPath: null,
              signedThumbnailUrl: undefined,
              thumbnailUnavailable: false,
            }
          : wi,
      ),
    );

    const updatedGridImages = this.workspaceView.rawImages().filter((wi) => wi.id === imageId);
    if (updatedGridImages.length > 0) {
      void this.workspaceView.batchSignThumbnails(updatedGridImages);
    }
  }

  private revokePendingBlob(): void {
    if (this.pendingBlobUrl) {
      URL.revokeObjectURL(this.pendingBlobUrl);
      this.pendingBlobUrl = null;
    }
  }
}

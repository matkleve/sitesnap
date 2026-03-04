/**
 * UploadPanelComponent — drag-and-drop / file-picker upload UI.
 *
 * Ground rules:
 *  - Signals for all local UI state; no BehaviorSubject.
 *  - No Supabase calls directly — all upload logic is in UploadService.
 *  - Errors are shown inline per-file; the panel never navigates.
 *  - Missing-EXIF files enter `awaiting_placement` state; the parent
 *    (MapShellComponent) must supply coordinates via placeFile().
 *  - Up to 3 uploads run in parallel (architecture.md §5 concurrency contract).
 *  - The Leaflet Map instance is received as an @Input so this component
 *    can hand off marker rendering to the parent via the imageUploaded output.
 */

import {
    Component,
    OnDestroy,
    input,
    output,
    signal,
    computed,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadService, ExifCoords, FileValidation, ParsedExif } from '../../../core/upload.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export type FileUploadStatus =
    | 'pending'
    | 'parsing'
    | 'uploading'
    | 'complete'
    | 'error'
    | 'awaiting_placement';

export interface FileUploadState {
    /** Stable key for ngFor tracking. */
    key: string;
    file: File;
    status: FileUploadStatus;
    /** 0–100 upload progress (set to 100 on success; Supabase SDK has no streaming progress). */
    progress: number;
    /** Human-readable error message when status === 'error'. */
    error?: string;
    /** Resolved coordinates after upload (present when status === 'complete'). */
    coords?: ExifCoords;
    /** UUID of the inserted images row (present when status === 'complete'). */
    imageId?: string;
    /** Object URL for inline thumbnail preview; revoked on dismiss. */
    thumbnailUrl?: string;
    /** Cached EXIF result from first parse; passed to uploadFile to avoid re-parsing. */
    parsedExif?: ParsedExif;
}

/** Emitted to the parent after a successful upload with valid GPS coordinates. */
export interface ImageUploadedEvent {
    id: string;
    lat: number;
    lng: number;
    /** Camera compass direction (0–360°), if available from EXIF. */
    direction?: number;
    /** Object URL used for marker thumbnail previews on the map. */
    thumbnailUrl?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

/** Maximum number of concurrent uploads (see architecture.md §5). */
const MAX_CONCURRENT = 3;

@Component({
    selector: 'app-upload-panel',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './upload-panel.component.html',
    styleUrl: './upload-panel.component.scss',
})
export class UploadPanelComponent implements OnDestroy {
    private readonly uploadService = inject(UploadService);

    // ── Inputs / outputs ───────────────────────────────────────────────────────

    /** Whether the panel is visible. Controlled by the parent MapShellComponent. */
    readonly visible = input<boolean>(false);

    /**
     * Emitted after each file is successfully uploaded and has GPS coordinates.
     * The parent adds a Leaflet marker at (lat, lng).
     */
    readonly imageUploaded = output<ImageUploadedEvent>();

    /**
     * Emitted when a file has no GPS EXIF data and enters `awaiting_placement`.
     * The parent (MapShellComponent) should enter placement mode so the next
     * map click supplies coordinates for this file.
     */
    readonly placementRequested = output<string>();

    // ── State ──────────────────────────────────────────────────────────────────

    readonly fileStates = signal<FileUploadState[]>([]);
    readonly isDragging = signal(false);

    /** True when at least one upload is in progress. */
    readonly isUploading = computed(() =>
        this.fileStates().some(
            (s) => s.status === 'parsing' || s.status === 'uploading',
        ),
    );

    /** True when any file is waiting for the user to place it on the map. */
    readonly hasAwaitingPlacement = computed(() =>
        this.fileStates().some((s) => s.status === 'awaiting_placement'),
    );

    // ── Drag-and-drop ──────────────────────────────────────────────────────────

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(true);
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            this.enqueueFiles(Array.from(files));
        }
    }

    // ── File input ─────────────────────────────────────────────────────────────

    onFileInputChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.enqueueFiles(Array.from(input.files));
            // Reset so the same file can be re-selected if needed
            input.value = '';
        }
    }

    // ── Core upload flow ───────────────────────────────────────────────────────

    /**
     * Adds files to the queue and kicks off up to MAX_CONCURRENT parallel uploads.
     * Validation failures are surfaced immediately as 'error' states without
     * consuming a concurrency slot.
     */
    private enqueueFiles(files: File[]): void {
        const newStates: FileUploadState[] = files.map((file) => {
            const validation: FileValidation = this.uploadService.validateFile(file);
            if (!validation.valid) {
                return {
                    key: crypto.randomUUID(),
                    file,
                    status: 'error' as FileUploadStatus,
                    progress: 0,
                    error: validation.error,
                    thumbnailUrl: URL.createObjectURL(file),
                };
            }
            return {
                key: crypto.randomUUID(),
                file,
                status: 'pending' as FileUploadStatus,
                progress: 0,
                thumbnailUrl: URL.createObjectURL(file),
            };
        });

        this.fileStates.update((prev) => [...prev, ...newStates]);

        // Start valid uploads immediately, up to the concurrency ceiling.
        this.drainQueue();
    }

    /**
     * Starts uploads for pending files, respecting the MAX_CONCURRENT cap.
     * Called after enqueuing and after each upload completes.
     */
    private drainQueue(): void {
        const states = this.fileStates();
        const activeCount = states.filter(
            (s) => s.status === 'parsing' || s.status === 'uploading',
        ).length;

        const pending = states.filter((s) => s.status === 'pending');
        const slotsAvailable = MAX_CONCURRENT - activeCount;

        for (let i = 0; i < Math.min(slotsAvailable, pending.length); i++) {
            this.processFile(pending[i].key);
        }
    }

    /** Runs the full pipeline (parse EXIF → upload) for one queued file. */
    private async processFile(key: string): Promise<void> {
        const state = this.findState(key);
        if (!state) return;

        // ── EXIF parsing phase ─────────────────────────────────────────────────
        this.setStatus(key, 'parsing');
        const parsedExif = await this.uploadService.parseExif(state.file);

        if (parsedExif.coords == null) {
            // No GPS data — store parsed EXIF for reuse, then prompt manual placement.
            this.fileStates.update((prev) =>
                prev.map((s) =>
                    s.key === key
                        ? { ...s, status: 'awaiting_placement' as FileUploadStatus, parsedExif }
                        : s,
                ),
            );
            this.placementRequested.emit(key);
            this.drainQueue();
            return;
        }

        await this.doUpload(key, parsedExif.coords, parsedExif);
    }

    /**
     * Uploads the file and updates state on completion.
     * @param coords        Coordinates to use (EXIF or manually placed).
     * @param parsedExif    Already-parsed EXIF data; passed to uploadFile to avoid
     *                      a second exifr parse of the same file.
     */
    private async doUpload(key: string, coords: ExifCoords, parsedExif?: ParsedExif): Promise<void> {
        const state = this.findState(key);
        if (!state) return;

        this.setStatus(key, 'uploading', { progress: 0 });

        // Pass cached parsedExif (parameter takes precedence; fall back to stored state).
        const exif = parsedExif ?? state.parsedExif;
        const result = await this.uploadService.uploadFile(state.file, coords, exif);

        if (result.error !== null) {
            const msg =
                result.error instanceof Error
                    ? result.error.message
                    : typeof result.error === 'object'
                        ? (result.error as { message?: string }).message ?? String(result.error)
                        : String(result.error);
            this.setStatus(key, 'error', { error: msg });
        } else {
            this.setStatus(key, 'complete', {
                progress: 100,
                coords: result.coords,
                imageId: result.id,
            });

            if (result.coords) {
                this.imageUploaded.emit({
                    id: result.id,
                    lat: result.coords.lat,
                    lng: result.coords.lng,
                    direction: result.direction,
                    thumbnailUrl: state.thumbnailUrl,
                });
            }
        }

        this.drainQueue();
    }

    // ── Manual placement ───────────────────────────────────────────────────────

    /**
     * Called by the parent MapShellComponent after the user clicks the map to
     * place an image that had no GPS EXIF data.
     * Triggers the upload using the manually chosen coordinates.
     */
    async placeFile(key: string, coords: ExifCoords): Promise<void> {
        const state = this.findState(key);
        if (!state || state.status !== 'awaiting_placement') return;
        await this.doUpload(key, coords, state.parsedExif);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Remove a completed or errored file entry from the list. */
    dismissFile(key: string): void {
        const state = this.findState(key);
        if (state?.thumbnailUrl && state.status !== 'complete') {
            URL.revokeObjectURL(state.thumbnailUrl);
        }
        this.fileStates.update((prev) => prev.filter((s) => s.key !== key));
    }

    /**
     * Resets an errored file back to pending so it re-enters the upload queue.
     * The existing thumbnail and parsedExif are retained.
     */
    retryFile(key: string): void {
        const state = this.findState(key);
        if (!state || state.status !== 'error') return;
        this.setStatus(key, 'pending', { error: undefined });
        this.drainQueue();
    }

    ngOnDestroy(): void {
        // Revoke all object URLs to avoid memory leaks.
        for (const s of this.fileStates()) {
            if (s.thumbnailUrl) URL.revokeObjectURL(s.thumbnailUrl);
        }
    }

    private findState(key: string): FileUploadState | undefined {
        return this.fileStates().find((s) => s.key === key);
    }

    private setStatus(
        key: string,
        status: FileUploadStatus,
        extra: Partial<FileUploadState> = {},
    ): void {
        this.fileStates.update((prev) =>
            prev.map((s) => (s.key === key ? { ...s, status, ...extra } : s)),
        );
    }

    /** TrackBy function for the ngFor loop. */
    trackByKey(_idx: number, state: FileUploadState): string {
        return state.key;
    }
}

/**
 * UploadPanelComponent — drag-and-drop / file-picker upload UI.
 *
 * Ground rules:
 *  - Thin UI layer — all queue management and upload orchestration
 *    are delegated to UploadManagerService.
 *  - Signals for all local UI state; no BehaviorSubject.
 *  - Errors are shown inline per-file; the panel never navigates.
 *  - Missing-data files (no GPS + no address) are reported to the parent
 *    so MapShellComponent can enter placement mode.
 *  - The panel reads upload state from uploadManager.jobs() —
 *    it does not maintain its own queue.
 */

import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExifCoords } from '../../../core/upload.service';
import {
  UploadManagerService,
  UploadJob,
  UploadPhase,
  ImageUploadedEvent as ManagerImageUploadedEvent,
} from '../../../core/upload-manager.service';

// ── Types ──────────────────────────────────────────────────────────────────────

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

@Component({
  selector: 'app-upload-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-panel.component.html',
  styleUrl: './upload-panel.component.scss',
})
export class UploadPanelComponent {
  private readonly uploadManager = inject(UploadManagerService);

  // ── Inputs / outputs ───────────────────────────────────────────────────────

  /** Whether the panel is visible. Controlled by the parent MapShellComponent. */
  readonly visible = input<boolean>(false);

  /**
   * Emitted after each file is successfully uploaded and has GPS coordinates.
   * The parent adds a Leaflet marker at (lat, lng).
   */
  readonly imageUploaded = output<ImageUploadedEvent>();

  /**
   * Emitted when a file has no GPS and no address and enters `missing_data`.
   * The parent (MapShellComponent) should enter placement mode so the next
   * map click supplies coordinates for this file.
   */
  readonly placementRequested = output<string>();

  // ── State (read from UploadManagerService) ─────────────────────────────────

  /** All upload jobs from the manager. */
  readonly jobs = this.uploadManager.jobs;

  readonly isDragging = signal(false);

  /** True when at least one upload is in progress. */
  readonly isUploading = this.uploadManager.isBusy;

  /** True when any file is waiting for manual placement. */
  readonly hasAwaitingPlacement = computed(() =>
    this.uploadManager.jobs().some((j) => j.phase === 'missing_data'),
  );

  constructor() {
    // React to manager events and bridge them to component outputs.
    effect(() => {
      // Re-read jobs signal to track changes.
      const jobs = this.uploadManager.jobs();
      // (Event bridging is handled by Observable subscriptions below.)
      void jobs;
    });

    // Bridge imageUploaded$ events from the manager to the component output.
    this.uploadManager.imageUploaded$.subscribe((event: ManagerImageUploadedEvent) => {
      if (event.coords) {
        this.imageUploaded.emit({
          id: event.imageId,
          lat: event.coords.lat,
          lng: event.coords.lng,
          direction: event.direction,
          thumbnailUrl: event.thumbnailUrl,
        });
      }
    });

    // Bridge missingData$ events to the placementRequested output.
    this.uploadManager.missingData$.subscribe((event) => {
      this.placementRequested.emit(event.jobId);
    });
  }

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
      this.uploadManager.submit(Array.from(files));
    }
  }

  // ── File input ─────────────────────────────────────────────────────────────

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadManager.submit(Array.from(input.files));
      // Reset so the same file can be re-selected if needed
      input.value = '';
    }
  }

  // ── Manual placement ───────────────────────────────────────────────────────

  /**
   * Called by the parent MapShellComponent after the user clicks the map to
   * place an image that had no GPS data and no address in the filename.
   * Delegates to the manager's placeJob method.
   */
  placeFile(key: string, coords: ExifCoords): void {
    this.uploadManager.placeJob(key, coords);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Remove a completed, errored, or missing_data job from the list. */
  dismissFile(jobId: string): void {
    this.uploadManager.dismissJob(jobId);
  }

  /** Retry a failed job. */
  retryFile(jobId: string): void {
    this.uploadManager.retryJob(jobId);
  }

  /** Map UploadPhase to a CSS-friendly status class name. */
  phaseToStatusClass(phase: UploadPhase): string {
    switch (phase) {
      case 'queued':
        return 'pending';
      case 'validating':
      case 'parsing_exif':
      case 'hashing':
      case 'dedup_check':
      case 'extracting_title':
        return 'parsing';
      case 'uploading':
      case 'saving_record':
        return 'uploading';
      case 'resolving_address':
      case 'resolving_coordinates':
        return 'uploading';
      case 'complete':
        return 'complete';
      case 'skipped':
        return 'skipped';
      case 'error':
        return 'error';
      case 'missing_data':
        return 'awaiting_placement';
    }
  }

  /** TrackBy function used in the template. */
  trackByJobId(_idx: number, job: UploadJob): string {
    return job.id;
  }
}

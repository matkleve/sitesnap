import { Component, computed, input, output, signal } from '@angular/core';
import type { WorkspaceImage } from '../../../core/workspace-view.types';
import { PHOTO_PLACEHOLDER_ICON, PHOTO_NO_PHOTO_ICON } from '../../../core/photo-load.service';

@Component({
  selector: 'app-thumbnail-card',
  template: `
    <button
      class="thumbnail-card"
      type="button"
      [attr.aria-label]="'View image ' + image().storagePath"
      (click)="clicked.emit(image().id)"
    >
      @if (image().signedThumbnailUrl) {
        <img
          class="thumbnail-card__img"
          [class.thumbnail-card__img--loaded]="!imgLoading()"
          [src]="image().signedThumbnailUrl"
          [alt]="'Photo thumbnail'"
          loading="lazy"
          (load)="onImgLoad()"
          (error)="onImgError()"
        />
      }
      @if (!imageReady()) {
        <div
          class="thumbnail-card__placeholder"
          [class.thumbnail-card__placeholder--loading]="isLoading()"
          [class.thumbnail-card__placeholder--no-photo]="!isLoading()"
        >
          <span
            class="thumbnail-card__placeholder-icon"
            [class.thumbnail-card__placeholder-icon--no-photo]="!isLoading()"
            aria-hidden="true"
          ></span>
        </div>
      }
    </button>
  `,
  styleUrl: './thumbnail-card.component.scss',
  host: {
    '[style.--placeholder-icon]': 'placeholderIconUrl',
    '[style.--no-photo-icon]': 'noPhotoIconUrl',
  },
})
export class ThumbnailCardComponent {
  readonly placeholderIconUrl = `url("${PHOTO_PLACEHOLDER_ICON}")`;
  readonly noPhotoIconUrl = `url("${PHOTO_NO_PHOTO_ICON}")`;
  readonly image = input.required<WorkspaceImage>();
  readonly clicked = output<string>();
  /** True while the <img> element is still loading from network. */
  readonly imgLoading = signal(true);
  /** True when the <img> errored (broken URL). */
  readonly imgErrored = signal(false);
  /** True when actively loading (waiting for signed URL or image download). */
  readonly isLoading = computed(
    () =>
      (!this.image().signedThumbnailUrl && !this.image().thumbnailUnavailable) ||
      (!!this.image().signedThumbnailUrl && this.imgLoading() && !this.imgErrored()),
  );
  /** True when the image has fully loaded and is ready to display. */
  readonly imageReady = computed(
    () => !!this.image().signedThumbnailUrl && !this.imgLoading() && !this.imgErrored(),
  );

  onImgLoad(): void {
    this.imgLoading.set(false);
  }

  onImgError(): void {
    this.imgLoading.set(false);
    this.imgErrored.set(true);
  }
}

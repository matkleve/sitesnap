import { Component, inject, input, output } from '@angular/core';
import { ImageRecord } from '../image-detail-view.types';
import { DeepLinkService } from '../../../../services/deep-link.service';
import { ToastService } from '../../../../core/toast.service';

@Component({
  selector: 'app-detail-actions',
  standalone: true,
  templateUrl: './detail-actions.component.html',
  styleUrl: './detail-actions.component.scss',
})
export class DetailActionsComponent {
  private readonly deepLink = inject(DeepLinkService);
  private readonly toast = inject(ToastService);

  readonly image = input<ImageRecord | null>(null);
  readonly deleteImage = output<void>();

  copyCoordinates(): void {
    const img = this.image();
    if (!img || img.latitude == null || img.longitude == null) return;
    const text = `${img.latitude.toFixed(6)}, ${img.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text).then(() => {
      this.toast.show('Coordinates copied');
    });
  }

  copyLink(): void {
    const img = this.image();
    if (!img) return;
    this.deepLink.copyLink('image', img.id);
  }
}

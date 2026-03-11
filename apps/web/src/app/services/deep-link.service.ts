import { inject, Injectable } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  private readonly toast = inject(ToastService);

  async copyLink(entityType: string, entityId: string): Promise<void> {
    const url = `${window.location.origin}/${entityType}/${entityId}`;
    await navigator.clipboard.writeText(url);
    this.toast.show('Link copied');
  }
}

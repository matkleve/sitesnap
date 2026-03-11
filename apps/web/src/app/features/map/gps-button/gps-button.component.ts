import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapAdapter } from '../../../core/map-adapter';
import { ToastService } from '../../../core/toast.service';

/**
 * Floating GPS Button that centers the map on the user's current location.
 * States: idle | seeking | active
 */
@Component({
  selector: 'ss-gps-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gps-button.component.html',
  styleUrls: ['./gps-button.component.scss'],
  host: {
    '[class.seeking]': "gpsState() === 'seeking'",
    '[class.active]': "gpsState() === 'active'",
    '[class.idle]': "gpsState() === 'idle'",
    tabindex: '0',
    'aria-label': 'Center map on your location',
    role: 'button',
  },
})
export class GpsButtonComponent {
  /** 'idle' | 'seeking' | 'active' */
  readonly gpsState = signal<'idle' | 'seeking' | 'active'>('idle');

  private toast = inject(ToastService);
  constructor(private map: MapAdapter) {}

  async onClick() {
    if (this.gpsState() === 'idle') {
      this.gpsState.set('seeking');
      try {
        const coords = await this.map.getCurrentPosition();
        this.map.panTo(coords);
        // User Location Marker handled by MapAdapter
        this.gpsState.set('active');
      } catch (e) {
        let msg = 'Unable to get your location.';
        if (typeof e === 'object' && e && 'message' in e) {
          msg = (e as any).message;
        }
        this.toast.show({ message: msg, type: 'error' });
        this.gpsState.set('idle');
      }
    } else if (this.gpsState() === 'active') {
      // Stop tracking
      this.gpsState.set('idle');
    }
  }
}

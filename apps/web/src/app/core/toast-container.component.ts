import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { ToastItemComponent } from './toast-item.component';

@Component({
  selector: 'ss-toast-container',
  standalone: true,
  imports: [ToastItemComponent],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  host: {
    role: 'region',
    'aria-label': 'Notifications',
    'aria-live': 'polite',
  },
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);
}

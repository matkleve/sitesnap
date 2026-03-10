import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
    selector: 'ss-toast',
    standalone: true,
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss'],
})
export class ToastComponent {
    toast = inject(ToastService);
}

// Minimal ToastService for showing error messages (Sitesnap)
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
    readonly message = signal<string | null>(null);
    readonly visible = signal(false);

    show(msg: string, duration = 3000) {
        this.message.set(msg);
        this.visible.set(true);
        setTimeout(() => this.hide(), duration);
    }

    hide() {
        this.visible.set(false);
        this.message.set(null);
    }
}

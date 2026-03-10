/**
 * PhotosComponent — placeholder for the /photos page.
 * Will be fully implemented in M-UI6.
 */
import { Component } from '@angular/core';

@Component({
    selector: 'app-photos',
    standalone: true,
    imports: [],
    template: `
        <div class="page-placeholder">
            <h1>Photos</h1>
            <p>Photo gallery — coming in M-UI6.</p>
        </div>
    `,
    styles: [`
        .page-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 0.5rem;
            color: var(--color-text-secondary);
        }
        h1 { color: var(--color-text-primary); }
    `],
})
export class PhotosComponent { }

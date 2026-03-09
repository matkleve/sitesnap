import { Component, input } from '@angular/core';

@Component({
    selector: 'app-thumbnail-grid',
    template: `
        <div class="thumbnail-grid">
            @if (activeClusterImageIds(); as ids) {
                <p class="thumbnail-grid__empty">{{ ids.length }} photos in selection</p>
            } @else {
                <p class="thumbnail-grid__empty">Select a marker on the map to see photos.</p>
            }
        </div>
    `,
    styleUrl: './thumbnail-grid.component.scss',
})
export class ThumbnailGridComponent {
    readonly activeTabId = input<string>('selection');
    readonly activeClusterImageIds = input<string[] | null>(null);
}


import { Component, input, output, signal } from '@angular/core';
import { PaneHeaderComponent } from './pane-header.component';
import { GroupTabBarComponent } from './group-tab-bar.component';
import { ThumbnailGridComponent } from './thumbnail-grid.component';
import { SortingControlsComponent } from './sorting-controls.component';
import { ImageDetailViewComponent } from './image-detail-view.component';

@Component({
    selector: 'app-workspace-pane',
    imports: [
        PaneHeaderComponent,
        GroupTabBarComponent,
        ThumbnailGridComponent,
        SortingControlsComponent,
        ImageDetailViewComponent,
    ],
    templateUrl: './workspace-pane.component.html',
    styleUrl: './workspace-pane.component.scss',
})
export class WorkspacePaneComponent {
    // ── Inputs from MapShell ──────────────────────────────────────────────────
    readonly detailImageId = input<string | null>(null);

    // ── Outputs to MapShell ──────────────────────────────────────────────────
    readonly closed = output<void>();
    readonly detailRequested = output<string>();
    readonly editLocationRequested = output<string>();

    // ── Internal state ───────────────────────────────────────────────────────
    readonly activeTabId = signal<string>('selection');
    readonly activeClusterImageIds = signal<string[] | null>(null);

    // ── Methods ──────────────────────────────────────────────────────────────
    close(): void {
        this.activeClusterImageIds.set(null);
        this.closed.emit();
    }

    onTabChange(tabId: string): void {
        this.activeTabId.set(tabId);
    }

    onThumbnailClick(imageId: string): void {
        this.detailRequested.emit(imageId);
    }

    onDetailClose(): void {
        this.closed.emit();
    }

    onEditLocation(imageId: string): void {
        this.editLocationRequested.emit(imageId);
    }
}

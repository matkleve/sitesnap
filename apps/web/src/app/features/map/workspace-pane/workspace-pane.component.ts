import { Component, input, output, signal } from '@angular/core';
import { PaneHeaderComponent } from './pane-header.component';
import { WorkspaceToolbarComponent } from './workspace-toolbar/workspace-toolbar.component';
import { ThumbnailGridComponent } from './thumbnail-grid.component';
import { ImageDetailViewComponent } from './image-detail-view.component';

@Component({
  selector: 'app-workspace-pane',
  imports: [
    PaneHeaderComponent,
    WorkspaceToolbarComponent,
    ThumbnailGridComponent,
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
  readonly detailClosed = output<void>();
  readonly detailRequested = output<string>();
  readonly editLocationRequested = output<string>();

  // ── Internal state ───────────────────────────────────────────────────────
  readonly activeTabId = signal<string>('selection');

  // ── Methods ──────────────────────────────────────────────────────────────
  close(): void {
    this.closed.emit();
  }

  onTabChange(tabId: string): void {
    this.activeTabId.set(tabId);
  }

  onThumbnailClick(imageId: string): void {
    this.detailRequested.emit(imageId);
  }

  onDetailClose(): void {
    this.detailClosed.emit();
  }

  onEditLocation(imageId: string): void {
    this.editLocationRequested.emit(imageId);
  }
}

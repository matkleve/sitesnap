import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { WorkspaceViewService } from '../../../core/workspace-view.service';
import { FilterService } from '../../../core/filter.service';
import type { GroupedSection, WorkspaceImage } from '../../../core/workspace-view.types';
import { ThumbnailCardComponent } from './thumbnail-card.component';
import { GroupHeaderComponent } from './group-header.component';

/** Flat renderable item — either a group header or a grid of images. */
type RenderItem =
  | { type: 'header'; heading: string; imageCount: number; level: number }
  | { type: 'grid'; images: WorkspaceImage[] };

@Component({
  selector: 'app-thumbnail-grid',
  template: `
    <div class="thumbnail-grid" #scrollContainer (scroll)="onScroll()">
      @if (viewService.isLoading()) {
        <div class="thumbnail-grid__skeleton">
          @for (i of skeletonCards; track i) {
            <div class="thumbnail-grid__skeleton-card"></div>
          }
        </div>
      } @else if (viewService.emptySelection()) {
        <div class="thumbnail-grid__empty-selection">
          <span class="thumbnail-grid__empty-icon">📷</span>
          <p>No photos at this location</p>
          <p class="thumbnail-grid__empty-hint">
            Images may not have been uploaded yet for this area.
          </p>
        </div>
      } @else if (viewService.rawImages().length === 0) {
        <p class="thumbnail-grid__empty">Select a marker on the map to see photos.</p>
      } @else if (viewService.totalImageCount() === 0) {
        <div class="thumbnail-grid__filter-empty">
          <p>No images match the current filters</p>
          <button class="thumbnail-grid__clear-btn" type="button" (click)="clearFilters()">
            Clear filters
          </button>
        </div>
      } @else if (hasGrouping()) {
        @for (item of renderItems(); track $index) {
          @if (!isItemHidden($index)) {
            @if (item.type === 'header') {
              <app-group-header
                [heading]="item.heading"
                [imageCount]="item.imageCount"
                [level]="item.level"
                [collapsed]="isCollapsed(item.heading)"
                (toggle)="viewService.toggleGroupCollapsed(item.heading)"
              />
            } @else {
              <div class="thumbnail-grid__cards">
                @for (img of item.images; track img.id) {
                  <app-thumbnail-card [image]="img" (clicked)="thumbnailClicked.emit($event)" />
                }
              </div>
            }
          }
        }
      } @else {
        <div class="thumbnail-grid__cards">
          @for (img of flatImages(); track img.id) {
            <app-thumbnail-card [image]="img" (clicked)="thumbnailClicked.emit($event)" />
          }
        </div>
      }
    </div>
  `,
  styleUrl: './thumbnail-grid.component.scss',
  imports: [ThumbnailCardComponent, GroupHeaderComponent],
})
export class ThumbnailGridComponent implements OnDestroy {
  protected readonly viewService = inject(WorkspaceViewService);
  private readonly filterService = inject(FilterService);

  readonly thumbnailClicked = output<string>();

  private readonly scrollContainerRef = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  private signBatchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly sections = computed(() => this.viewService.groupedSections());

  readonly hasGrouping = computed(() => this.viewService.activeGroupings().length > 0);

  /** Flatten grouped sections into a linear list of headers + grids. */
  readonly renderItems = computed<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const flatten = (sections: GroupedSection[]) => {
      for (const section of sections) {
        if (section.heading) {
          items.push({
            type: 'header',
            heading: section.heading,
            imageCount: section.imageCount,
            level: section.headingLevel,
          });
        }
        if (section.subGroups && section.subGroups.length > 0) {
          flatten(section.subGroups);
        } else if (section.images.length > 0) {
          items.push({ type: 'grid', images: section.images });
        }
      }
    };
    flatten(this.sections());
    return items;
  });

  readonly flatImages = computed(() => {
    const sections = this.sections();
    if (sections.length === 1 && !sections[0].heading) {
      return sections[0].images;
    }
    return sections.flatMap((s) => s.images);
  });

  readonly skeletonCards = Array.from({ length: 12 }, (_, i) => i);

  constructor() {
    afterNextRender(() => {
      this.scheduleThumbnailSigning();
    });
  }

  ngOnDestroy(): void {
    if (this.signBatchTimer) {
      clearTimeout(this.signBatchTimer);
    }
  }

  isCollapsed(heading: string): boolean {
    return this.viewService.collapsedGroups().has(heading);
  }

  /**
   * Check if an item should be hidden because any ancestor header is collapsed.
   * For headers: hidden if any preceding header at a lower level is collapsed.
   * For grids:  hidden if the nearest header or any of its ancestors is collapsed.
   */
  isItemHidden(index: number): boolean {
    const items = this.renderItems();
    const item = items[index];

    // Top-level headers are never hidden
    if (item.type === 'header' && item.level === 0) return false;

    // Walk backward collecting ancestors.
    // contextLevel starts at the item's own level (header) or Infinity (grid).
    let contextLevel = item.type === 'header' ? item.level : Infinity;

    for (let i = index - 1; i >= 0; i--) {
      const prev = items[i];
      if (prev.type === 'header' && prev.level < contextLevel) {
        if (this.isCollapsed(prev.heading)) return true;
        contextLevel = prev.level;
        if (contextLevel === 0) break;
      }
    }
    return false;
  }

  clearFilters(): void {
    this.filterService.clearAll();
    this.viewService.selectedProjectIds.set(new Set());
  }

  onScroll(): void {
    this.scheduleThumbnailSigning();
  }

  /** Batch-sign thumbnails for currently visible images after a debounce. */
  private scheduleThumbnailSigning(): void {
    if (this.signBatchTimer) clearTimeout(this.signBatchTimer);
    this.signBatchTimer = setTimeout(() => {
      const images =
        this.flatImages().length > 0
          ? this.flatImages()
          : this.sections().flatMap((s) => this.collectImages(s));
      const unsigned = images.filter((img) => !img.signedThumbnailUrl && !img.thumbnailUnavailable);
      if (unsigned.length > 0) {
        void this.viewService.batchSignThumbnails(unsigned.slice(0, 50));
      }
    }, 200);
  }

  private collectImages(
    section: GroupedSection,
  ): import('../../../core/workspace-view.types').WorkspaceImage[] {
    const result = [...section.images];
    if (section.subGroups) {
      for (const sub of section.subGroups) {
        result.push(...this.collectImages(sub));
      }
    }
    return result;
  }
}

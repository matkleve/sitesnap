/**
 * ActiveFilterChipsComponent — horizontal strip of removable filter chips.
 *
 * Renders below the Search Bar in the Map Zone when any map-level filter is active.
 * Each chip shows a human-readable label and a × button to remove that filter.
 *
 * Ground rules:
 *  - No own state — all data comes from MapFilterService.
 *  - Chips react immediately to signal changes (no RxJS).
 *  - Only renders when at least one filter is active.
 */

import { Component, inject } from '@angular/core';
import { MapFilterService, ActiveFilter } from '../../../core/map-filter.service';

@Component({
  selector: 'ss-active-filter-chips',
  standalone: true,
  template: `
    @if (mapFilterService.hasActiveFilters()) {
      <div class="filter-chips" role="list" aria-label="Active map filters">
        @for (filter of mapFilterService.filters(); track filter) {
          <button
            class="filter-chip"
            type="button"
            role="listitem"
            [attr.aria-label]="'Remove filter: ' + mapFilterService.getChipLabel(filter)"
            (click)="remove(filter)"
          >
            <span class="filter-chip__label">{{ mapFilterService.getChipLabel(filter) }}</span>
            <span class="filter-chip__remove" aria-hidden="true">×</span>
          </button>
        }
      </div>
    }
  `,
  styleUrl: './active-filter-chips.component.scss',
})
export class ActiveFilterChipsComponent {
  protected readonly mapFilterService = inject(MapFilterService);

  remove(filter: ActiveFilter): void {
    this.mapFilterService.removeFilter(filter);
  }
}

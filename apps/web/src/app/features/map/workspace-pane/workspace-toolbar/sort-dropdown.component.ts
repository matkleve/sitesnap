import { Component, computed, output, signal } from '@angular/core';
import type { SortConfig } from '../../../../core/workspace-view.types';

type SortOption = {
  id: string;
  label: string;
  icon: string;
  defaultDirection: 'asc' | 'desc';
};

@Component({
  selector: 'app-sort-dropdown',
  template: `
    <div class="sort-dropdown">
      <div class="sort-search">
        <input
          class="sort-search__input"
          type="text"
          placeholder="Search properties…"
          [value]="searchTerm()"
          (input)="searchTerm.set($any($event.target).value)"
        />
      </div>
      <div class="sort-options">
        @for (opt of filteredOptions(); track opt.id) {
          <button
            class="sort-option"
            [class.sort-option--active]="opt.id === activeSortId()"
            (click)="setSort(opt.id)"
          >
            <span class="material-icons sort-option__icon" aria-hidden="true">{{ opt.icon }}</span>
            <span class="sort-option__label">{{ opt.label }}</span>
            @if (opt.id === activeSortId()) {
              <span class="material-icons sort-option__check" aria-hidden="true">check</span>
            }
            <button
              class="sort-option__direction"
              (click)="flipDirection(); $event.stopPropagation()"
              [attr.aria-label]="'Sort ' + (sortDirection() === 'asc' ? 'ascending' : 'descending')"
            >
              {{ sortDirection() === 'asc' ? '↑' : '↓' }}
            </button>
          </button>
        } @empty {
          <div class="sort-empty">No matching properties</div>
        }
      </div>
    </div>
  `,
  styleUrl: './sort-dropdown.component.scss',
})
export class SortDropdownComponent {
  private readonly options: SortOption[] = [
    { id: 'date-captured', label: 'Date captured', icon: 'schedule', defaultDirection: 'desc' },
    { id: 'date-uploaded', label: 'Date uploaded', icon: 'cloud_upload', defaultDirection: 'desc' },
    { id: 'name', label: 'Name', icon: 'sort_by_alpha', defaultDirection: 'asc' },
    { id: 'distance', label: 'Distance', icon: 'straighten', defaultDirection: 'asc' },
    { id: 'address', label: 'Address', icon: 'location_on', defaultDirection: 'asc' },
    { id: 'city', label: 'City', icon: 'location_city', defaultDirection: 'asc' },
    { id: 'country', label: 'Country', icon: 'flag', defaultDirection: 'asc' },
    { id: 'project', label: 'Project', icon: 'folder', defaultDirection: 'asc' },
  ];

  readonly searchTerm = signal('');
  readonly activeSortId = signal('date-captured');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  readonly sortChanged = output<SortConfig>();

  readonly filteredOptions = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.options;
    return this.options.filter((o) => o.label.toLowerCase().includes(term));
  });

  setSort(id: string): void {
    const opt = this.options.find((o) => o.id === id);
    if (!opt) return;
    this.activeSortId.set(id);
    this.sortDirection.set(opt.defaultDirection);
    this.sortChanged.emit({ key: id, direction: opt.defaultDirection });
  }

  flipDirection(): void {
    this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    this.sortChanged.emit({ key: this.activeSortId(), direction: this.sortDirection() });
  }
}

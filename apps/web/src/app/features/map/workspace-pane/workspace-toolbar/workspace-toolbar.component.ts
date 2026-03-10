import { Component, signal, computed, ElementRef, HostListener, inject } from '@angular/core';
import { GroupingDropdownComponent, type GroupingProperty } from './grouping-dropdown.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { SortDropdownComponent } from './sort-dropdown.component';
import { ProjectsDropdownComponent } from './projects-dropdown.component';
import { WorkspaceViewService } from '../../../../core/workspace-view.service';
import { FilterService } from '../../../../core/filter.service';
import type { PropertyRef, SortConfig } from '../../../../core/workspace-view.types';

export type ToolbarDropdown = 'grouping' | 'filter' | 'sort' | 'projects' | null;

const ALL_GROUPING_PROPERTIES: GroupingProperty[] = [
  { id: 'date', label: 'Date', icon: 'schedule' },
  { id: 'year', label: 'Year', icon: 'calendar_today' },
  { id: 'month', label: 'Month', icon: 'date_range' },
  { id: 'project', label: 'Project', icon: 'folder' },
  { id: 'city', label: 'City', icon: 'location_city' },
  { id: 'district', label: 'District', icon: 'map' },
  { id: 'street', label: 'Street', icon: 'signpost' },
  { id: 'country', label: 'Country', icon: 'flag' },
  { id: 'address', label: 'Address', icon: 'location_on' },
  { id: 'user', label: 'User', icon: 'person' },
];

@Component({
  selector: 'app-workspace-toolbar',
  templateUrl: './workspace-toolbar.component.html',
  styleUrl: './workspace-toolbar.component.scss',
  imports: [
    GroupingDropdownComponent,
    FilterDropdownComponent,
    SortDropdownComponent,
    ProjectsDropdownComponent,
  ],
})
export class WorkspaceToolbarComponent {
  private readonly viewService = inject(WorkspaceViewService);
  private readonly filterService = inject(FilterService);

  readonly activeDropdown = signal<ToolbarDropdown>(null);

  // Dropdown position (fixed, computed from button rect)
  readonly dropdownTop = signal(0);
  readonly dropdownLeft = signal(0);

  // --- Grouping state (persists across dropdown open/close) ---
  readonly activeGroupings = signal<GroupingProperty[]>([]);
  readonly availableGroupings = signal<GroupingProperty[]>([...ALL_GROUPING_PROPERTIES]);

  // Active-state indicators — wired to services
  readonly hasGrouping = computed(() => this.viewService.activeGroupings().length > 0);
  readonly hasFilters = computed(() => this.filterService.activeCount() > 0);
  readonly hasCustomSort = computed(() => {
    const sort = this.viewService.activeSort();
    return sort.key !== 'captured_at' || sort.direction !== 'desc';
  });
  readonly hasProject = computed(() => this.viewService.selectedProjectIds().size > 0);

  readonly buttons = [
    { id: 'grouping' as const, label: 'Grouping', active: this.hasGrouping },
    { id: 'filter' as const, label: 'Filter', active: this.hasFilters },
    { id: 'sort' as const, label: 'Sort', active: this.hasCustomSort },
    { id: 'projects' as const, label: 'Projects', active: this.hasProject },
  ];

  // Guard: skip click-outside detection during CDK drag operations
  private _isDragging = false;

  constructor(private readonly elRef: ElementRef<HTMLElement>) {}

  /** Called by child dropdowns to suppress click-outside while dragging. */
  onDragStarted(): void {
    this._isDragging = true;
  }

  /** Called by child dropdowns when drag ends. */
  onDragEnded(): void {
    // Defer reset so the synthetic click from mouseup doesn't trigger close
    setTimeout(() => (this._isDragging = false));
  }

  onGroupingsChanged(active: GroupingProperty[], available: GroupingProperty[]): void {
    this.activeGroupings.set(active);
    this.availableGroupings.set(available);
    // Push to WorkspaceViewService
    this.viewService.activeGroupings.set(
      active.map((g) => ({ id: g.id, label: g.label, icon: g.icon }) as PropertyRef),
    );
  }

  onSortChanged(sortConfig: SortConfig): void {
    this.viewService.activeSort.set(sortConfig);
  }

  onProjectsChanged(selectedIds: Set<string>): void {
    this.viewService.selectedProjectIds.set(selectedIds);
  }

  toggleDropdown(id: ToolbarDropdown, event: MouseEvent): void {
    if (this.activeDropdown() === id) {
      this.activeDropdown.set(null);
      return;
    }
    // Position dropdown below the clicked button, clamped to viewport
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const dropdownWidth = id === 'filter' ? 352 : 240; // min-width per spec
    const viewportWidth = window.innerWidth;
    const padding = 8; // keep 8px from viewport edge

    let left = rect.left;
    if (left + dropdownWidth > viewportWidth - padding) {
      left = Math.max(padding, viewportWidth - dropdownWidth - padding);
    }

    this.dropdownTop.set(rect.bottom + 4);
    this.dropdownLeft.set(left);
    this.activeDropdown.set(id);
  }

  closeDropdown(): void {
    this.activeDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this._isDragging) return;
    if (this.activeDropdown() && !this.elRef.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDropdown();
  }
}

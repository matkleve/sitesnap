import { Component, signal, computed, ElementRef, HostListener } from '@angular/core';
import { GroupingDropdownComponent, type GroupingProperty } from './grouping-dropdown.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { SortDropdownComponent } from './sort-dropdown.component';
import { ProjectsDropdownComponent } from './projects-dropdown.component';

export type ToolbarDropdown = 'grouping' | 'filter' | 'sort' | 'projects' | null;

const ALL_GROUPING_PROPERTIES: GroupingProperty[] = [
  { id: 'date', label: 'Date', icon: 'schedule' },
  { id: 'project', label: 'Project', icon: 'folder' },
  { id: 'city', label: 'City', icon: 'location_city' },
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
  readonly activeDropdown = signal<ToolbarDropdown>(null);

  // Dropdown position (fixed, computed from button rect)
  readonly dropdownTop = signal(0);
  readonly dropdownLeft = signal(0);

  // --- Grouping state (persists across dropdown open/close) ---
  readonly activeGroupings = signal<GroupingProperty[]>([]);
  readonly availableGroupings = signal<GroupingProperty[]>([...ALL_GROUPING_PROPERTIES]);

  // Active-state indicators
  readonly hasGrouping = computed(() => this.activeGroupings().length > 0);
  readonly hasFilters = signal(false);
  readonly hasCustomSort = signal(false);
  readonly hasProject = signal(false);

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
  }

  toggleDropdown(id: ToolbarDropdown, event: MouseEvent): void {
    if (this.activeDropdown() === id) {
      this.activeDropdown.set(null);
      return;
    }
    // Position dropdown below the clicked button
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.dropdownTop.set(rect.bottom + 4);
    this.dropdownLeft.set(rect.left);
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

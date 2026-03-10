import { Component, computed, inject, output, signal } from '@angular/core';
import { SupabaseService } from '../../../../core/supabase.service';
import { WorkspaceViewService } from '../../../../core/workspace-view.service';

interface Project {
  id: string;
  name: string;
  imageCount: number;
}

@Component({
  selector: 'app-projects-dropdown',
  template: `
    <div class="projects-dropdown">
      <div class="projects-search">
        <input
          class="projects-search__input"
          type="text"
          placeholder="Search projects…"
          [value]="searchTerm()"
          (input)="searchTerm.set($any($event.target).value)"
        />
        @if (searchTerm()) {
          <button
            class="projects-search__clear"
            (click)="searchTerm.set('')"
            aria-label="Clear search"
          >
            <span class="material-icons">close</span>
          </button>
        }
      </div>
      <div class="projects-list">
        <label class="projects-row projects-row--all">
          <input
            type="checkbox"
            class="projects-row__checkbox"
            [checked]="allSelected()"
            [indeterminate]="someSelected()"
            (change)="toggleAll()"
          />
          <span class="projects-row__label">All projects</span>
        </label>
        @for (project of filteredProjects(); track project.id) {
          <label class="projects-row">
            <input
              type="checkbox"
              class="projects-row__checkbox"
              [checked]="selectedIds().has(project.id)"
              (change)="toggleProject(project.id)"
            />
            <span class="projects-row__label">{{ project.name }}</span>
            <span class="projects-row__count">{{ project.imageCount }}</span>
          </label>
        }
      </div>
      <button class="projects-new" (click)="isCreating.set(true)">
        <span class="material-icons">add</span>
        New project
      </button>
    </div>
  `,
  styleUrl: './projects-dropdown.component.scss',
})
export class ProjectsDropdownComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly viewService = inject(WorkspaceViewService);

  readonly projects = signal<Project[]>([]);
  readonly searchTerm = signal('');
  readonly selectedIds = signal<Set<string>>(new Set(this.viewService.selectedProjectIds()));
  readonly isCreating = signal(false);

  readonly projectsChanged = output<Set<string>>();

  readonly filteredProjects = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const all = this.projects();
    if (!term) return all;
    return all.filter((p) => p.name.toLowerCase().includes(term));
  });

  readonly allSelected = computed(() => {
    const all = this.projects();
    return all.length > 0 && this.selectedIds().size === all.length;
  });

  readonly someSelected = computed(() => {
    const size = this.selectedIds().size;
    return size > 0 && size < this.projects().length;
  });

  constructor() {
    void this.loadProjects();
  }

  toggleProject(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    this.projectsChanged.emit(this.selectedIds());
  }

  toggleAll(): void {
    const all = this.projects();
    if (this.selectedIds().size === all.length) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(all.map((p) => p.id)));
    }
    this.projectsChanged.emit(this.selectedIds());
  }

  private async loadProjects(): Promise<void> {
    const { data, error } = await this.supabase.client.from('projects').select('id, name');
    if (error || !data) return;
    this.projects.set(
      data.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
        imageCount: 0,
      })),
    );
  }
}

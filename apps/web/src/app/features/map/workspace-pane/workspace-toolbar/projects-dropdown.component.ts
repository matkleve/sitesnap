import { Component, signal } from '@angular/core';

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
  // Placeholder data — will be wired to SupabaseService
  readonly projects = signal<Project[]>([
    { id: '1', name: 'Highway A1 Inspection', imageCount: 42 },
    { id: '2', name: 'Bridge Renovation', imageCount: 18 },
    { id: '3', name: 'Solar Panel Site', imageCount: 7 },
  ]);

  readonly searchTerm = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly isCreating = signal(false);

  readonly filteredProjects = signal<Project[]>(this.projects());
  readonly allSelected = signal(false);
  readonly someSelected = signal(false);

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
  }

  toggleAll(): void {
    const all = this.projects();
    if (this.selectedIds().size === all.length) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(all.map((p) => p.id)));
    }
  }
}

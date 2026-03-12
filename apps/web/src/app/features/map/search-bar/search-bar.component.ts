import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SearchDropdownItemComponent } from './search-dropdown-item.component';
import { SearchOrchestratorService } from '../../../core/search/search-orchestrator.service';
import { SearchBarService } from '../../../core/search/search-bar.service';
import {
  SearchCandidate,
  SearchQueryContext,
  SearchRecentCandidate,
  SearchResultSet,
  SearchSection,
  SearchState,
} from '../../../core/search/search.models';

const MAX_RECENT_SEARCHES = 8;

type SearchSectionsState = {
  dbAddress: SearchSection;
  dbContent: SearchSection;
  geocoder: SearchSection;
};

@Component({
  selector: 'ss-search-bar',
  standalone: true,
  imports: [CommonModule, SearchDropdownItemComponent],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
  host: {
    class: 'search-bar-host',
  },
})
export class SearchBarComponent implements OnInit, OnDestroy {
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly searchBarService = inject(SearchBarService);
  private readonly searchOrchestrator = inject(SearchOrchestratorService);

  private readonly queryChanges = new BehaviorSubject<string>('');
  private readonly contextChanges = new BehaviorSubject<SearchQueryContext>({});
  private readonly subscription = new Subscription();
  private suppressNextDocumentClick = false;

  readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  readonly mapCenterRequested = output<{ lat: number; lng: number; label: string }>();
  readonly clearRequested = output<void>();
  readonly dropPinRequested = output<void>();

  readonly state = signal<SearchState>('idle');
  readonly query = signal('');
  readonly dropdownOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly sections = signal<SearchSectionsState>(this.createEmptySections());
  readonly recentSearches = signal<SearchRecentCandidate[]>([]);
  readonly committedCandidate = signal<SearchCandidate | null>(null);
  readonly commandSection = signal<SearchSection | null>(null);
  readonly liveRegionText = signal('');

  readonly allEmpty = computed(() => {
    const sections = this.sections();
    return (
      sections.dbAddress.items.length === 0 &&
      sections.dbContent.items.length === 0 &&
      sections.geocoder.items.length === 0
    );
  });

  readonly geocoderLoading = computed(() => this.sections().geocoder.loading === true);
  readonly showingRecentSearches = computed(
    () => this.dropdownOpen() && this.query().trim().length === 0,
  );
  readonly showingEmptyState = computed(
    () =>
      this.dropdownOpen() &&
      this.query().trim().length > 0 &&
      !this.geocoderLoading() &&
      this.allEmpty(),
  );

  readonly selectableItems = computed(() => {
    if (!this.dropdownOpen()) {
      return [] as SearchCandidate[];
    }

    if (this.showingRecentSearches()) {
      return this.recentSearches();
    }

    const sections = this.sections();
    return [
      ...sections.dbAddress.items,
      ...sections.dbContent.items,
      ...(this.commandSection()?.items ?? []),
      ...sections.geocoder.items,
    ];
  });

  ngOnInit(): void {
    this.recentSearches.set(
      this.searchBarService.loadRecentSearches().slice(0, MAX_RECENT_SEARCHES),
    );
    this.configureSearchSources();

    this.subscription.add(
      this.searchOrchestrator
        .searchInput(this.queryChanges.asObservable(), this.contextChanges.asObservable())
        .subscribe((result) => this.applySearchResult(result)),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  focusSearch(): void {
    const input = this.searchInput().nativeElement;
    input.focus();
    input.select();
    this.dropdownOpen.set(true);
    this.state.set(this.query().trim() ? 'typing' : 'focused-empty');
    this.activeIndex.set(-1);
  }

  onFocus(): void {
    this.recentSearches.set(
      this.searchBarService.loadRecentSearches().slice(0, MAX_RECENT_SEARCHES),
    );
    this.dropdownOpen.set(true);
    this.activeIndex.set(-1);
    this.state.set(this.query().trim() ? this.state() : 'focused-empty');
  }

  onInput(event: Event): void {
    const nextQuery = (event.target as HTMLInputElement).value;
    this.query.set(nextQuery);
    this.dropdownOpen.set(true);
    this.activeIndex.set(-1);

    const committedCandidate = this.committedCandidate();
    if (
      committedCandidate &&
      this.normalizeLabel(committedCandidate.label) !== this.normalizeLabel(nextQuery)
    ) {
      this.committedCandidate.set(null);
      this.clearRequested.emit();
    }

    if (!nextQuery.trim()) {
      this.state.set('focused-empty');
      this.sections.set(this.createEmptySections());
      this.commandSection.set(null);
      this.liveRegionText.set('');
    } else {
      this.state.set('typing');
    }

    this.queryChanges.next(nextQuery);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveActiveIndex(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      const candidate = this.selectableItems()[this.activeIndex()] ?? this.selectableItems()[0];
      if (!candidate) {
        return;
      }

      event.preventDefault();
      this.commitCandidate(candidate);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.dropdownOpen()) {
        this.dropdownOpen.set(false);
        this.activeIndex.set(-1);
        this.state.set(this.committedCandidate() ? 'committed' : 'idle');
      } else {
        this.searchInput().nativeElement.blur();
        this.state.set(this.committedCandidate() ? 'committed' : 'idle');
      }
      return;
    }

    if (event.key === 'Backspace' && !this.query().trim() && this.committedCandidate()) {
      this.clearSearch();
    }
  }

  onClearClick(): void {
    this.clearSearch();
    this.focusSearch();
  }

  onDropPinClick(): void {
    this.dropdownOpen.set(false);
    this.activeIndex.set(-1);
    this.state.set('idle');
    this.dropPinRequested.emit();
  }

  onCandidateSelected(candidate: SearchCandidate): void {
    this.commitCandidate(candidate);
  }

  optionIdFor(index: number): string {
    return `search-option-${index}`;
  }

  contentOptionIndex(index: number): number {
    return this.sections().dbAddress.items.length + index;
  }

  geocoderOptionIndex(index: number): number {
    return this.sections().dbAddress.items.length + this.sections().dbContent.items.length + index;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.focusSearch();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.suppressNextDocumentClick) {
      this.suppressNextDocumentClick = false;
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!this.hostElement.nativeElement.contains(target)) {
      this.dropdownOpen.set(false);
      this.activeIndex.set(-1);
      this.state.set(this.committedCandidate() ? 'committed' : 'idle');
    }
  }

  private applySearchResult(result: SearchResultSet): void {
    if (result.query !== this.query()) {
      return;
    }

    const dbAddressSection =
      result.sections.find((section) => section.family === 'db-address') ??
      this.createSection('db-address', 'Addresses');
    const dbContentSection =
      result.sections.find((section) => section.family === 'db-content') ??
      this.createSection('db-content', 'Projects & Groups');
    const geocoderSection =
      result.sections.find((section) => section.family === 'geocoder') ??
      this.createSection('geocoder', 'Places');
    const commandSection = result.sections.find((section) => section.family === 'command') ?? null;

    this.sections.set({
      dbAddress: dbAddressSection,
      dbContent: dbContentSection,
      geocoder: geocoderSection,
    });
    this.commandSection.set(commandSection);

    if (result.state === 'focused-empty') {
      this.state.set(this.dropdownOpen() ? 'focused-empty' : 'idle');
      return;
    }

    this.state.set(result.state);

    if (result.state === 'results-complete') {
      const resultCount = this.selectableItems().length;
      this.liveRegionText.set(
        resultCount > 0
          ? `${resultCount} results available for ${this.query().trim()}.`
          : `No address found for ${this.query().trim()}.`,
      );
    }
  }

  private moveActiveIndex(direction: 1 | -1): void {
    if (!this.dropdownOpen()) {
      this.dropdownOpen.set(true);
    }

    const items = this.selectableItems();
    if (items.length === 0) {
      this.activeIndex.set(-1);
      return;
    }

    const currentIndex = this.activeIndex();
    if (currentIndex === -1) {
      this.activeIndex.set(direction === 1 ? 0 : items.length - 1);
      return;
    }

    this.activeIndex.set((currentIndex + direction + items.length) % items.length);
  }

  private commitCandidate(candidate: SearchCandidate): void {
    if (candidate.family === 'recent') {
      this.query.set(candidate.label);
      this.dropdownOpen.set(true);
      this.state.set('typing');
      this.activeIndex.set(-1);
      this.queryChanges.next(candidate.label);
      return;
    }

    this.committedCandidate.set(candidate);
    this.query.set(candidate.label);
    this.dropdownOpen.set(false);
    this.activeIndex.set(-1);
    this.state.set('committed');
    this.addRecentSearch(candidate.label);
    this.suppressNextDocumentClick = true;

    const commitAction = this.searchOrchestrator.commit(candidate, candidate.label);
    switch (commitAction.type) {
      case 'map-center':
        this.mapCenterRequested.emit({
          lat: commitAction.lat,
          lng: commitAction.lng,
          label: candidate.label,
        });
        break;
      case 'open-content':
        if (candidate.family !== 'db-content') {
          break;
        }

        void this.router.navigate([candidate.contentType === 'group' ? '/groups' : '/photos'], {
          queryParams: {
            search: commitAction.query,
            type: candidate.contentType,
            id: commitAction.contentId,
          },
        });
        break;
      case 'run-command':
        if (commitAction.command === 'go-to-location') {
          this.dropPinRequested.emit();
        }
        break;
      case 'recent-selected':
        this.queryChanges.next(commitAction.label);
        break;
    }
  }

  private clearSearch(): void {
    this.query.set('');
    this.state.set('focused-empty');
    this.dropdownOpen.set(false);
    this.activeIndex.set(-1);
    this.sections.set(this.createEmptySections());
    this.commandSection.set(null);
    this.liveRegionText.set('');
    this.committedCandidate.set(null);
    this.queryChanges.next('');
    this.clearRequested.emit();
  }

  private configureSearchSources(): void {
    this.searchOrchestrator.configureSources({
      dbAddressResolver: (query, ctx) => this.searchBarService.resolveDbAddresses(query, ctx),
      dbContentResolver: (query, ctx) => this.searchBarService.resolveDbContent(query, ctx),
      geocoderResolver: (query, ctx) => this.searchBarService.resolveGeocoder(query, ctx),
    });
  }

  private addRecentSearch(label: string): void {
    const nextRecentSearches = this.searchBarService
      .addRecentSearch(label, this.contextChanges.value.activeProjectId, this.recentSearches())
      .slice(0, MAX_RECENT_SEARCHES);
    this.recentSearches.set(nextRecentSearches);
    this.searchOrchestrator.addRecentSearch(label);
  }

  private createEmptySections(): SearchSectionsState {
    return {
      dbAddress: this.createSection('db-address', 'Addresses'),
      dbContent: this.createSection('db-content', 'Projects & Groups'),
      geocoder: this.createSection('geocoder', 'Places'),
    };
  }

  private createSection(family: SearchSection['family'], title: string): SearchSection {
    return { family, title, items: [] };
  }

  private normalizeLabel(value: string): string {
    return value.trim().toLowerCase();
  }
}

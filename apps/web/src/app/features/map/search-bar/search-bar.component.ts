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
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  catchError,
  from,
  map,
  of,
} from 'rxjs';
import { SearchDropdownItemComponent } from './search-dropdown-item.component';
import { SearchOrchestratorService } from '../../../core/search/search-orchestrator.service';
import {
  SearchAddressCandidate,
  SearchCandidate,
  SearchContentCandidate,
  SearchQueryContext,
  SearchRecentCandidate,
  SearchResultSet,
  SearchSection,
  SearchState,
} from '../../../core/search/search.models';
import { SupabaseService } from '../../../core/supabase.service';

const RECENT_SEARCHES_STORAGE_KEY = 'sitesnap-recent-searches';
const MAX_DB_ADDRESS_ROWS = 24;
const MAX_DB_ADDRESS_RESULTS = 5;
const MAX_DB_CONTENT_RESULTS = 6;
const MAX_RECENT_SEARCHES = 8;

interface DbAddressRow {
  id: string;
  address_label: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface DbContentRow {
  id: string;
  name: string | null;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
  country?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  address?: NominatimAddress;
}

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
  private readonly supabaseService = inject(SupabaseService);
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
    this.loadRecentSearches();
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
    this.loadRecentSearches();
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
      dbAddressResolver: (query) => this.resolveDbAddressCandidates(query),
      dbContentResolver: (query) => this.resolveDbContentCandidates(query),
      geocoderResolver: (query) => this.resolveGeocoderCandidates(query),
    });
  }

  private resolveDbAddressCandidates(query: string): Observable<SearchAddressCandidate[]> {
    return from(this.fetchDbAddressCandidates(query)).pipe(catchError(() => of([])));
  }

  private resolveDbContentCandidates(query: string): Observable<SearchContentCandidate[]> {
    return from(this.fetchDbContentCandidates(query)).pipe(catchError(() => of([])));
  }

  private resolveGeocoderCandidates(query: string): Observable<SearchAddressCandidate[]> {
    return from(this.fetchGeocoderCandidates(query)).pipe(catchError(() => of([])));
  }

  private async fetchDbAddressCandidates(query: string): Promise<SearchAddressCandidate[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const response = await this.supabaseService.client
      .from('images')
      .select('id,address_label,latitude,longitude')
      .ilike('address_label', `%${trimmedQuery}%`)
      .not('address_label', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(MAX_DB_ADDRESS_ROWS);

    if (response.error || !Array.isArray(response.data)) {
      return [];
    }

    const grouped = new Map<
      string,
      {
        label: string;
        ids: string[];
        latTotal: number;
        lngTotal: number;
        count: number;
        score: number;
      }
    >();

    for (const row of response.data as DbAddressRow[]) {
      const label = row.address_label?.trim();
      const lat = this.toNumber(row.latitude);
      const lng = this.toNumber(row.longitude);
      if (!label || lat === null || lng === null) {
        continue;
      }

      const key = label.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.ids.push(row.id);
        existing.latTotal += lat;
        existing.lngTotal += lng;
        existing.count += 1;
        existing.score = Math.max(existing.score, this.computeScore(label, trimmedQuery));
        continue;
      }

      grouped.set(key, {
        label,
        ids: [row.id],
        latTotal: lat,
        lngTotal: lng,
        count: 1,
        score: this.computeScore(label, trimmedQuery),
      });
    }

    return [...grouped.values()]
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return right.count - left.count;
      })
      .slice(0, MAX_DB_ADDRESS_RESULTS)
      .map((entry, index) => ({
        id: entry.ids[0] ?? `db-address-${index}`,
        family: 'db-address',
        label: entry.label,
        lat: entry.latTotal / entry.count,
        lng: entry.lngTotal / entry.count,
        imageCount: entry.count,
        score: entry.score,
      }));
  }

  private async fetchDbContentCandidates(query: string): Promise<SearchContentCandidate[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const [projectsResponse, groupsResponse] = await Promise.all([
      this.supabaseService.client
        .from('projects')
        .select('id,name')
        .ilike('name', `%${trimmedQuery}%`)
        .limit(MAX_DB_CONTENT_RESULTS),
      this.supabaseService.client
        .from('saved_groups')
        .select('id,name')
        .ilike('name', `%${trimmedQuery}%`)
        .limit(MAX_DB_CONTENT_RESULTS),
    ]);

    const projectCandidates = (
      projectsResponse.error || !Array.isArray(projectsResponse.data)
        ? []
        : (projectsResponse.data as DbContentRow[])
            .filter((row) => !!row.name)
            .map((row) => ({
              id: `project-${row.id}`,
              family: 'db-content' as const,
              label: row.name?.trim() ?? '',
              contentType: 'project' as const,
              contentId: row.id,
              subtitle: 'Project',
              score: this.computeScore(row.name ?? '', trimmedQuery),
            }))
    ).filter((candidate) => candidate.label.length > 0);

    const groupCandidates = (
      groupsResponse.error || !Array.isArray(groupsResponse.data)
        ? []
        : (groupsResponse.data as DbContentRow[])
            .filter((row) => !!row.name)
            .map((row) => ({
              id: `group-${row.id}`,
              family: 'db-content' as const,
              label: row.name?.trim() ?? '',
              contentType: 'group' as const,
              contentId: row.id,
              subtitle: 'Saved group',
              score: this.computeScore(row.name ?? '', trimmedQuery),
            }))
    ).filter((candidate) => candidate.label.length > 0);

    return [...projectCandidates, ...groupCandidates]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, MAX_DB_CONTENT_RESULTS);
  }

  private async fetchGeocoderCandidates(query: string): Promise<SearchAddressCandidate[]> {
    const normalizedQuery = this.normalizeSearchQuery(query);
    if (!normalizedQuery) {
      return [];
    }

    const queries = [normalizedQuery, ...this.buildFallbackQueries(normalizedQuery)];
    for (const currentQuery of queries) {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentQuery)}&format=json&limit=5&addressdetails=1`;
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as NominatimResult[];
      if (!Array.isArray(data) || data.length === 0) {
        continue;
      }

      return data.reduce<SearchAddressCandidate[]>((candidates, result, index) => {
        const lat = Number.parseFloat(result.lat);
        const lng = Number.parseFloat(result.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          return candidates;
        }

        candidates.push({
          id: `geo-${currentQuery}-${index}`,
          family: 'geocoder' as const,
          label: this.formatGeocoderLabel(result),
          lat,
          lng,
          score: result.importance ?? 0,
        });
        return candidates;
      }, []);
    }

    return [];
  }

  private loadRecentSearches(): void {
    const storage = this.getStorage();
    if (!storage) {
      this.recentSearches.set([]);
      return;
    }

    try {
      const raw = storage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (!raw) {
        this.recentSearches.set([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.recentSearches.set([]);
        return;
      }

      const recentItems = parsed
        .filter(
          (item): item is SearchRecentCandidate =>
            typeof item === 'object' &&
            item !== null &&
            'label' in item &&
            typeof item.label === 'string',
        )
        .slice(0, MAX_RECENT_SEARCHES);

      this.recentSearches.set(recentItems);
    } catch {
      this.recentSearches.set([]);
    }
  }

  private addRecentSearch(label: string): void {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      return;
    }

    const item: SearchRecentCandidate = {
      id: `recent-${normalizedLabel.toLowerCase()}`,
      family: 'recent',
      label: normalizedLabel,
      lastUsedAt: new Date().toISOString(),
    };

    const nextRecentSearches = [
      item,
      ...this.recentSearches().filter(
        (existing) => existing.label.toLowerCase() !== normalizedLabel.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    this.recentSearches.set(nextRecentSearches);
    this.searchOrchestrator.addRecentSearch(normalizedLabel);

    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(nextRecentSearches));
    } catch {
      // Ignore storage failures and keep in-memory recents.
    }
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

  private getStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
  }

  private computeScore(label: string, query: string): number {
    const normalizedLabel = label.trim().toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedLabel || !normalizedQuery) {
      return 0;
    }

    if (normalizedLabel === normalizedQuery) {
      return 1;
    }

    if (normalizedLabel.startsWith(normalizedQuery)) {
      return 0.92;
    }

    if (normalizedLabel.includes(normalizedQuery)) {
      return 0.8;
    }

    const sharedTokens = normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => normalizedLabel.includes(token)).length;

    return Math.min(0.79, sharedTokens * 0.2);
  }

  private toNumber(value: number | string | null): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  private normalizeLabel(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeSearchQuery(query: string): string {
    return this.applyStreetTokenCorrections(
      query
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  private applyStreetTokenCorrections(query: string): string {
    return query
      .split(' ')
      .map((token) => {
        if (!token) {
          return token;
        }

        if (token === 'g' || token === 'g.') return 'gasse';
        if (token === 'str' || token === 'str.') return 'strasse';
        if (token.endsWith('str.')) return `${token.slice(0, -1)}asse`;
        if (token.endsWith('gass') || token.endsWith('gasse')) {
          return token.endsWith('gasse') ? token : `${token}e`;
        }
        if (token.endsWith('gase')) return `${token.slice(0, -4)}gasse`;
        if (token.endsWith('gas')) return `${token}se`;
        if (token.endsWith('stras')) return `${token}se`;
        if (token.endsWith('strase')) return `${token.slice(0, -6)}strasse`;
        if (token.endsWith('strassee')) return token.slice(0, -1);
        if (token.endsWith('str')) return `${token}asse`;

        return token;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildFallbackQueries(normalizedQuery: string): string[] {
    const candidates = new Set<string>();
    const correctedStreetHouse = this.applyStreetTokenCorrections(normalizedQuery);

    if (correctedStreetHouse && correctedStreetHouse !== normalizedQuery) {
      candidates.add(correctedStreetHouse);
    }

    const streetOnlyBase = correctedStreetHouse || normalizedQuery;
    const streetOnly = streetOnlyBase.replace(/\s+\d+[a-zA-Z]?\s*$/, '').trim();
    if (streetOnly && streetOnly !== normalizedQuery && streetOnly !== correctedStreetHouse) {
      candidates.add(streetOnly);
    }

    const correctedStreetOnly = this.applyStreetTokenCorrections(streetOnly);
    if (
      correctedStreetOnly &&
      correctedStreetOnly !== normalizedQuery &&
      correctedStreetOnly !== correctedStreetHouse &&
      correctedStreetOnly !== streetOnly
    ) {
      candidates.add(correctedStreetOnly);
    }

    return [...candidates];
  }

  private formatGeocoderLabel(result: NominatimResult): string {
    const address = result.address;
    if (address) {
      const street = [address.road, address.house_number].filter(Boolean).join(' ').trim();
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.hamlet ||
        address.county;
      const zipCity = [address.postcode, city].filter(Boolean).join(' ').trim();
      const rightPart = [zipCity, address.country].filter(Boolean).join(' ').trim();

      if (street && rightPart) return `${street}, ${rightPart}`;
      if (street) return street;
      if (rightPart) return rightPart;
    }

    return result.display_name;
  }
}

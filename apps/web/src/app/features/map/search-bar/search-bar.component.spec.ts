import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SearchBarComponent } from './search-bar.component';
import { SearchOrchestratorService } from '../../../core/search/search-orchestrator.service';
import { SupabaseService } from '../../../core/supabase.service';

function createQueryBuilder(result: { data: unknown[]; error: unknown }) {
  const builder = {
    select: vi.fn(),
    ilike: vi.fn(),
    not: vi.fn(),
    limit: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.limit.mockResolvedValue(result);

  return builder;
}

describe('SearchBarComponent', () => {
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    router = { navigate: vi.fn().mockResolvedValue(true) };

    const imagesBuilder = createQueryBuilder({
      data: [
        {
          id: 'img-1',
          address_label: 'Burgstrasse 7, Zurich',
          latitude: 47.3769,
          longitude: 8.5417,
        },
      ],
      error: null,
    });
    const projectsBuilder = createQueryBuilder({
      data: [{ id: 'project-1', name: 'Burg Renovation' }],
      error: null,
    });
    const groupsBuilder = createQueryBuilder({
      data: [{ id: 'group-1', name: 'Burg Quote Group' }],
      error: null,
    });

    await TestBed.configureTestingModule({
      imports: [SearchBarComponent],
      providers: [
        SearchOrchestratorService,
        {
          provide: Router,
          useValue: router,
        },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: vi.fn((table: string) => {
                if (table === 'images') return imagesBuilder;
                if (table === 'projects') return projectsBuilder;
                if (table === 'saved_groups') return groupsBuilder;
                return createQueryBuilder({ data: [], error: null });
              }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens recent searches on focus', () => {
    localStorage.setItem(
      'sitesnap-recent-searches',
      JSON.stringify([
        {
          id: 'recent-burg',
          family: 'recent',
          label: 'Burgstrasse 7, Zurich',
          lastUsedAt: new Date().toISOString(),
        },
      ]),
    );

    const fixture = TestBed.createComponent(SearchBarComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(fixture.componentInstance.dropdownOpen()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Recent searches');
    expect(fixture.nativeElement.textContent).toContain('Burgstrasse 7, Zurich');
  });

  it('focuses the input on Ctrl+K', () => {
    const fixture = TestBed.createComponent(SearchBarComponent);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    expect(fixture.componentInstance.dropdownOpen()).toBe(true);
  });

  it('shows grouped DB and geocoder results after debounced input', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            lat: '46.948',
            lon: '7.4474',
            display_name: 'Burgstrasse 7, Bern, Switzerland',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const fixture = TestBed.createComponent(SearchBarComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'burg';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Addresses');
    expect(fixture.nativeElement.textContent).toContain('Projects & Groups');
    expect(fixture.nativeElement.textContent).toContain('Places');
  });

  it('commits the highlighted item with Enter and emits map-center for addresses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const fixture = TestBed.createComponent(SearchBarComponent);
    const mapCenterSpy = vi.fn();
    fixture.componentInstance.mapCenterRequested.subscribe(mapCenterSpy);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'burg';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(mapCenterSpy).toHaveBeenCalledWith({
      lat: 47.3769,
      lng: 8.5417,
      label: 'Burgstrasse 7, Zurich',
    });
  });

  it('navigates to the groups route for group content commits', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const fixture = TestBed.createComponent(SearchBarComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.onCandidateSelected({
      id: 'group-1',
      family: 'db-content',
      label: 'Burg Quote Group',
      contentType: 'group',
      contentId: 'group-1',
      subtitle: 'Saved group',
    });

    expect(router.navigate).toHaveBeenCalledWith(['/groups'], {
      queryParams: {
        search: 'Burg Quote Group',
        type: 'group',
        id: 'group-1',
      },
    });
  });

  it('shows the clear button after a committed candidate and clears state when clicked', () => {
    const fixture = TestBed.createComponent(SearchBarComponent);
    const clearSpy = vi.fn();
    fixture.componentInstance.clearRequested.subscribe(clearSpy);
    fixture.detectChanges();

    fixture.componentInstance.onCandidateSelected({
      id: 'db-1',
      family: 'db-address',
      label: 'Burgstrasse 7, Zurich',
      lat: 47.3769,
      lng: 8.5417,
    });
    fixture.detectChanges();

    const clearButton = fixture.nativeElement.querySelector(
      '.search-bar__clear',
    ) as HTMLButtonElement;
    expect(clearButton).not.toBeNull();

    clearButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.query()).toBe('');
    expect(fixture.componentInstance.committedCandidate()).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('shows the empty state and emits drop pin when requested', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const fixture = TestBed.createComponent(SearchBarComponent);
    const dropPinSpy = vi.fn();
    fixture.componentInstance.dropPinRequested.subscribe(dropPinSpy);
    fixture.detectChanges();

    const supabaseService = TestBed.inject(SupabaseService) as unknown as {
      client: { from: ReturnType<typeof vi.fn> };
    };
    supabaseService.client.from = vi.fn(() =>
      createQueryBuilder({ data: [], error: null }),
    ) as never;

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'nowhere';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No address found for nowhere');

    const dropPinButton = fixture.nativeElement.querySelector(
      '.search-bar__ghost-action',
    ) as HTMLButtonElement;
    dropPinButton.click();

    expect(dropPinSpy).toHaveBeenCalledTimes(1);
  });
});

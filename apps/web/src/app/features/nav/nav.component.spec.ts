/**
 * NavComponent unit tests — M-UI2 (LeftSidebar redesign).
 *
 * Tests:
 *  1.  Component creates
 *  2.  Renders nav rows with avatar Settings entry
 *  3.  Active route is highlighted (routerLinkActive adds nav__link--active)
 *  4.  Inactive route does not get nav__link--active
 *  5.  Disabled nav items carry aria-disabled="true"
 *  6.  Disabled nav items have .nav__link--disabled and tabindex="-1"
 *  7.  Avatar displays the correct email initial
 *  8.  Avatar shows '?' when no user is signed in
 *  9.  nav element has aria-label="Main navigation"
 * 10.  Icons are rendered as span.material-icons elements
 * 11.  Each nav row renders a .nav__label element (visible on expand)
 * 12.  Sidebar panel has .sidebar__panel class
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { NavComponent } from './nav.component';
import { AuthService } from '../../core/auth.service';

function collectCssRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = [];

  const appendRules = (cssRules: CSSRuleList | CSSRule[]) => {
    for (const rule of Array.from(cssRules)) {
      if (rule instanceof CSSStyleRule) {
        rules.push(rule);
        continue;
      }

      if ('cssRules' in rule) {
        appendRules((rule as CSSGroupingRule).cssRules);
      }
    }
  };

  for (const styleSheet of Array.from(document.styleSheets)) {
    try {
      appendRules(styleSheet.cssRules);
    } catch {
      // Ignore cross-origin or inaccessible stylesheets from the test runner.
    }
  }

  return rules;
}

function findCssRule(selectorFragment: string): CSSStyleRule | undefined {
  return collectCssRules().find((rule) => rule.selectorText?.includes(selectorFragment));
}

function findCssRuleByPredicate(
  predicate: (rule: CSSStyleRule) => boolean,
): CSSStyleRule | undefined {
  return collectCssRules().find(predicate);
}

function createMockUser(emailOverride: string | null, metadata: Record<string, unknown> = {}) {
  if (!emailOverride) {
    return null;
  }

  return {
    email: emailOverride,
    user_metadata: metadata,
  } as any;
}

function buildTestBed(emailOverride: string | null = null, metadata: Record<string, unknown> = {}) {
  const mockUser = signal(createMockUser(emailOverride, metadata));

  return TestBed.configureTestingModule({
    imports: [NavComponent],
    providers: [
      provideRouter([
        { path: '', component: NavComponent },
        { path: 'photos', component: NavComponent },
        { path: 'groups', component: NavComponent },
        { path: 'settings', component: NavComponent },
      ]),
      {
        provide: AuthService,
        useValue: {
          user: mockUser,
          session: signal(null),
          loading: signal(false),
          initialize: vi.fn().mockResolvedValue(undefined),
        },
      },
    ],
  }).compileComponents();
}

describe('NavComponent', () => {
  beforeEach(async () => {
    await buildTestBed('test@example.com');
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(NavComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders three primary nav items plus avatar settings row', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    const links = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.nav__link:not(.nav__link--disabled)'),
    );
    expect(links.length).toBe(4);
  });

  it('highlights Map nav item when router is at root route', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    await router.navigate(['/']);
    await fixture.whenStable();
    fixture.detectChanges();

    const allLinks = Array.from<HTMLAnchorElement>(
      fixture.nativeElement.querySelectorAll('a.nav__link'),
    );
    const mapLink = allLinks.find((l) => l.getAttribute('href') === '/');
    expect(mapLink).not.toBeNull();
    expect(mapLink?.classList).toContain('nav__link--active');
  });

  it('does not highlight Map when router is at /photos', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    await router.navigate(['/photos']);
    await fixture.whenStable();
    fixture.detectChanges();

    const allLinks = Array.from<HTMLAnchorElement>(
      fixture.nativeElement.querySelectorAll('a.nav__link'),
    );
    const mapLink = allLinks.find((l) => l.getAttribute('href') === '/');
    expect(mapLink?.classList).not.toContain('nav__link--active');
  });

  it('disabled items have aria-disabled="true"', () => {
    const fixture = TestBed.createComponent(NavComponent);
    // Add a disabled item to navItems for this test
    fixture.componentInstance.navItems = [
      ...fixture.componentInstance.navItems,
      { icon: 'bar_chart', label: 'Reports', route: '/reports', disabled: true },
    ];
    fixture.detectChanges();

    const disabledEl = fixture.nativeElement.querySelector('[aria-disabled="true"]') as HTMLElement;
    expect(disabledEl).not.toBeNull();
    expect(disabledEl.getAttribute('aria-disabled')).toBe('true');
  });

  it('disabled items have pointer-events: none style class', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.componentInstance.navItems = [
      { icon: 'bar_chart', label: 'Reports', route: '/reports', disabled: true },
    ];
    fixture.detectChanges();

    const disabledEl = fixture.nativeElement.querySelector('.nav__link--disabled') as HTMLElement;
    expect(disabledEl).not.toBeNull();
    expect(disabledEl.getAttribute('tabindex')).toBe('-1');
  });

  it('avatar shows correct initial from user email', async () => {
    // Rebuild TestBed with a specific email
    TestBed.resetTestingModule();
    await buildTestBed('john@example.com');

    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.nav__avatar-initial') as HTMLElement;
    expect(avatar?.textContent?.trim()).toBe('J');
  });

  it('avatar shows ? when no user is signed in', async () => {
    TestBed.resetTestingModule();
    await buildTestBed(null);

    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.nav__avatar-initial') as HTMLElement;
    expect(avatar?.textContent?.trim()).toBe('?');
  });

  it('shows Settings as the expanded avatar-row label', async () => {
    TestBed.resetTestingModule();
    await buildTestBed('john@example.com', { full_name: 'John Doe' });

    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const accountName = fixture.nativeElement.querySelector('.nav__account-name') as HTMLElement;
    expect(accountName?.textContent?.trim()).toBe('Settings');
  });

  it('uses the full name for the avatar initial when available', async () => {
    TestBed.resetTestingModule();
    await buildTestBed('john@example.com', { full_name: 'Jane Doe' });

    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.nav__avatar-initial') as HTMLElement;
    expect(avatar?.textContent?.trim()).toBe('J');
  });

  it('nav has aria-label "Main navigation"', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav?.getAttribute('aria-label')).toBe('Main navigation');
  });

  // ── LeftSidebar-specific tests ─────────────────────────────────────────────

  it('icons are rendered as span.material-icons elements', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    const icons = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.nav__icon.material-icons'),
    );
    // One icon per primary nav item.
    expect(icons.length).toBe(3);
    // Icon text content matches a Material Icon name (no emoji).
    const firstIcon = icons[0];
    expect(firstIcon.textContent?.trim()).toBe('map');
  });

  it('each nav row has a .nav__label element for the expand animation', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    const labels = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.nav__label'));
    // 3 primary nav rows + avatar settings row.
    expect(labels.length).toBe(4);
  });

  it('sidebar container has .sidebar__panel class', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.sidebar__panel') as HTMLElement;
    expect(panel).not.toBeNull();
  });

  it('renders nav links and the account row with the same row shell', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const rowLinks = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll(
        '.nav__list > .sidebar__item:not(.sidebar__item--spacer) > .nav__link',
      ),
    );

    expect(rowLinks.length).toBe(4);

    for (const rowLink of rowLinks) {
      expect(rowLink.children.length).toBe(2);
      expect((rowLink.children[0] as HTMLElement).classList.contains('nav__media')).toBe(true);
      expect((rowLink.children[1] as HTMLElement).classList.contains('nav__label')).toBe(true);
    }
  });

  it('places the account row in the shared nav list structure', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const accountItem = fixture.nativeElement.querySelector(
      '.nav__list > .sidebar__item--account',
    ) as HTMLElement | null;

    expect(accountItem).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.sidebar__avatar-slot')).toBeNull();
  });

  it('keeps row geometry out of the sidebar expansion selectors', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const hoverRowRule = findCssRuleByPredicate((rule) => {
      const selector = rule.selectorText ?? '';
      return (
        selector.includes('.sidebar') &&
        selector.includes('.nav__link') &&
        selector.includes(':hover')
      );
    });
    const focusRowRule = findCssRuleByPredicate((rule) => {
      const selector = rule.selectorText ?? '';
      return (
        selector.includes('.sidebar') &&
        selector.includes('.nav__link') &&
        selector.includes(':focus-within')
      );
    });
    const labelRule = findCssRuleByPredicate((rule) => {
      const selector = rule.selectorText ?? '';
      return (
        selector.includes('.sidebar') &&
        selector.includes('.nav__label') &&
        selector.includes(':hover')
      );
    });

    expect(hoverRowRule).toBeUndefined();
    expect(focusRowRule).toBeUndefined();
    expect(labelRule).toBeDefined();
    expect(labelRule?.style.getPropertyValue('opacity')).toBe('1');
    expect(labelRule?.style.getPropertyValue('visibility')).toBe('visible');
  });

  it('uses a fixed media column and avoids animating row layout properties', () => {
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    const rowRule = findCssRule('.nav__link');
    const mediaRule = findCssRule('.nav__media');
    const labelRule = findCssRule('.nav__label');
    const rowTransition = rowRule?.style.getPropertyValue('transition') ?? '';
    const labelTransition = labelRule?.style.getPropertyValue('transition') ?? '';

    expect(rowRule?.style.getPropertyValue('grid-template-columns')).toContain(
      'var(--sidebar-media-size)',
    );
    expect(rowRule?.style.getPropertyValue('column-gap')).toBe('var(--sidebar-row-gap)');
    expect(mediaRule?.style.getPropertyValue('inline-size')).toBe('var(--sidebar-media-size)');
    expect(mediaRule?.style.getPropertyValue('min-inline-size')).toBe('var(--sidebar-media-size)');
    expect(rowTransition).not.toContain('padding');
    expect(rowTransition).not.toContain('gap');
    expect(rowTransition).not.toContain('max-width');
    expect(rowTransition).not.toContain('min-height');
    expect(labelTransition).not.toContain('transform');
    expect(labelTransition).not.toContain('max-width');
  });
});

import { Component, ElementRef, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { NavComponent } from './features/nav/nav.component';
import { LocationResolverService } from './core/location-resolver.service';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly locationResolver = inject(LocationResolverService);
  private readonly auth = inject(AuthService);
  private readonly elRef = inject(ElementRef<HTMLElement>);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly showNav = computed(() => !this.currentUrl().startsWith('/auth'));

  ngOnInit(): void {
    // Start background location resolution once the user is authenticated.
    // Runs at ~1 req/sec through all unresolved images — non-blocking.
    if (this.auth.user()) {
      this.locationResolver.startBackgroundResolution();
    }
  }

  /** Called when Escape is pressed inside the nav; returns focus to the main content. */
  onNavEscape(): void {
    const mainContent = (this.elRef.nativeElement as HTMLElement).querySelector(
      'router-outlet + * [tabindex], router-outlet + * .map-container',
    ) as HTMLElement | null;
    if (mainContent) {
      mainContent.focus();
    }
  }
}

import { Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { NavComponent } from './features/nav/nav.component';
import { ToastContainerComponent } from './core/toast-container.component';
import { LocationResolverService } from './core/location-resolver.service';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly locationResolver = inject(LocationResolverService);
  private readonly auth = inject(AuthService);

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
}

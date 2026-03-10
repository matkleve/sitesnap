/**
 * Root application configuration.
 *
 * Ground rules:
 *  - AuthService.initialize() MUST run via APP_INITIALIZER before any route
 *    guard executes. This ensures the session signal is populated from Supabase
 *    storage before guards make allow/redirect decisions.
 *  - provideRouter uses withComponentInputBinding so route params can be bound
 *    directly as component inputs in the future.
 *  - Add new global providers here, not in individual feature modules.
 */

import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Router with component-input binding enabled for future use
    provideRouter(routes, withComponentInputBinding()),

    // Initialize auth session before the first route renders.
    // Guards will wait for loading() === false before deciding.
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const auth = inject(AuthService);
        return () => auth.initialize();
      },
      multi: true,
    },
  ],
};

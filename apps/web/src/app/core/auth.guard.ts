/**
 * Route guards for authentication.
 *
 * Ground rules:
 *  - authGuard: protects routes that require a logged-in user.
 *    Unauthenticated users are redirected to /auth/login.
 *  - guestGuard: protects login/register routes from already-logged-in users.
 *    Authenticated users are redirected to the app root /.
 *  - Both guards wait for AuthService.loading to be false before deciding,
 *    so they never redirect based on a stale null session on first load.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, take } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Wait for AuthService.loading to flip to false.
 * Accepts the already-injected AuthService so injection context is not required
 * inside this helper (only the calling guard needs injection context).
 */
function waitForAuth(auth: AuthService): Promise<void> {
    if (!auth.loading()) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        toObservable(auth.loading)
            .pipe(
                filter((loading) => !loading),
                take(1),
            )
            .subscribe(() => resolve());
    });
}

/**
 * Protects any route that requires authentication.
 * Usage: canActivate: [authGuard]
 */
export const authGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await waitForAuth(auth);

    if (auth.session()) {
        return true;
    }

    // Redirect to login, preserving nothing — user must re-authenticate
    return router.createUrlTree(['/auth/login']);
};

/**
 * Prevents authenticated users from revisiting login/register screens.
 * Usage: canActivate: [guestGuard]
 */
export const guestGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await waitForAuth(auth);

    if (!auth.session()) {
        return true;
    }

    // Already logged in — go to the main app
    return router.createUrlTree(['/']);
};

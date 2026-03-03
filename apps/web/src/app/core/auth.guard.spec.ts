/**
 * Route guard unit tests.
 *
 * Strategy:
 *  - Guards use inject(), so they must be called inside TestBed.runInInjectionContext().
 *  - AuthService is replaced with a minimal fake that exposes only the signals and
 *    methods the guards depend on.
 *  - loading() is set to false by default so waitForAuth() resolves immediately
 *    without needing toObservable (which requires a live signal subscription).
 *  - UrlTree results are compared by calling .toString() to avoid deep equality issues.
 */

import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSession() {
    return {
        access_token: 'tok',
        refresh_token: 'ref',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'uid-1', email: 'user@example.com' },
    } as any;
}

function setup(authenticated: boolean) {
    const sessionSig = signal<any>(authenticated ? makeSession() : null);
    const loadingSig = signal(false); // already loaded

    const fakeAuth = {
        session: sessionSig,
        loading: loadingSig,
    };

    const routerSpy = {
        navigate: vi.fn(),
        createUrlTree: vi.fn((commands: any[]) => ({ toString: () => commands.join('/') } as unknown as UrlTree)),
    };

    TestBed.configureTestingModule({
        providers: [
            { provide: AuthService, useValue: fakeAuth },
            { provide: Router, useValue: routerSpy },
        ],
    });

    return { fakeAuth, routerSpy };
}

// ── authGuard ──────────────────────────────────────────────────────────────────

describe('authGuard', () => {
    it('returns true when user is authenticated', async () => {
        setup(true);
        const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
        expect(result).toBe(true);
    });

    it('redirects to /auth/login when user is NOT authenticated', async () => {
        setup(false);
        const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
        expect(result).not.toBe(true);
        // Result is a UrlTree pointing at /auth/login
        const tree = result as UrlTree;
        expect(tree.toString()).toContain('auth/login');
    });
});

// ── guestGuard ─────────────────────────────────────────────────────────────────

describe('guestGuard', () => {
    it('returns true when user is NOT authenticated (access allowed)', async () => {
        setup(false);
        const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
        expect(result).toBe(true);
    });

    it('redirects to / when user IS authenticated', async () => {
        setup(true);
        const result = await TestBed.runInInjectionContext(() => guestGuard({} as any, {} as any));
        expect(result).not.toBe(true);
        const tree = result as UrlTree;
        expect(tree.toString()).toContain('/');
    });
});

// ── waitForAuth loading race ───────────────────────────────────────────────────

describe('authGuard loading race condition', () => {
    it('waits until loading is false before evaluating session', async () => {
        const sessionSig = signal<any>(null);
        const loadingSig = signal(true); // starts loading

        const fakeAuth = {
            session: sessionSig,
            loading: loadingSig,
        };

        const routerSpy = {
            navigate: vi.fn(),
            createUrlTree: vi.fn(
                (commands: any[]) => ({ toString: () => commands.join('/') } as unknown as UrlTree),
            ),
        };

        TestBed.configureTestingModule({
            providers: [
                { provide: AuthService, useValue: fakeAuth },
                { provide: Router, useValue: routerSpy },
            ],
        });

        // Start the guard — it will be waiting inside waitForAuth
        const guardPromise = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

        // Session arrives before loading flips
        sessionSig.set(makeSession());

        // Now loading flips to false — guard should proceed and see the session
        loadingSig.set(false);
        TestBed.flushEffects();

        const result = await guardPromise;
        expect(result).toBe(true);
    });
});

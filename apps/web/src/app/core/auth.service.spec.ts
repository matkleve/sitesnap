/**
 * AuthService unit tests.
 *
 * Strategy:
 *  - SupabaseService is replaced with a fake (supabaseFake) so no real HTTP calls
 *    are made. The fake exposes a minimal auth API matching the shape AuthService uses.
 *  - Router is provided as a spy so we can assert navigations without a real app.
 *  - Every test calls TestBed.flushEffects() / fixture stabilisation where needed.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSession(overrides: object = {}) {
    return {
        access_token: 'tok',
        refresh_token: 'ref',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'uid-1', email: 'test@example.com', ...overrides },
    } as any;
}

function buildFakeSupabase(authOverrides: Partial<ReturnType<typeof buildFakeAuth>> = {}) {
    return {
        client: {
            auth: {
                ...buildFakeAuth(),
                ...authOverrides,
            },
        },
    };
}

function buildFakeAuth() {
    return {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        signUp: vi.fn().mockResolvedValue({ error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
    };
}

function setup(authOverrides: Partial<ReturnType<typeof buildFakeAuth>> = {}) {
    const fakeSupabase = buildFakeSupabase(authOverrides);
    const routerSpy = { navigate: vi.fn() };

    TestBed.configureTestingModule({
        providers: [
            AuthService,
            { provide: SupabaseService, useValue: fakeSupabase },
            { provide: Router, useValue: routerSpy },
        ],
    });

    const service = TestBed.inject(AuthService);
    return { service, fakeSupabase, routerSpy };
}

// ── Test suites ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
    describe('initialize()', () => {
        it('sets session signal from storage and sets loading to false', async () => {
            const session = makeSession();
            const { service, fakeSupabase } = setup({
                getSession: vi.fn().mockResolvedValue({ data: { session } }),
            });

            await service.initialize();

            expect(service.session()).toEqual(session);
            expect(service.loading()).toBe(false);
        });

        it('sets session to null when no session in storage', async () => {
            const { service } = setup();
            await service.initialize();
            expect(service.session()).toBeNull();
            expect(service.loading()).toBe(false);
        });

        it('subscribes to onAuthStateChange', async () => {
            const { service, fakeSupabase } = setup();
            await service.initialize();
            expect(fakeSupabase.client.auth.onAuthStateChange).toHaveBeenCalledOnce();
        });

        it('navigates to /auth/update-password on PASSWORD_RECOVERY event', async () => {
            let capturedCallback: ((event: string, session: any) => void) | null = null;
            const { service, routerSpy } = setup({
                onAuthStateChange: vi.fn().mockImplementation((cb) => {
                    capturedCallback = cb;
                    return { data: { subscription: { unsubscribe: vi.fn() } } };
                }),
            });

            await service.initialize();
            capturedCallback!('PASSWORD_RECOVERY', makeSession());

            expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/update-password']);
        });

        it('updates session signal when onAuthStateChange fires', async () => {
            let capturedCallback: ((event: string, session: any) => void) | null = null;
            const session = makeSession();
            const { service } = setup({
                onAuthStateChange: vi.fn().mockImplementation((cb) => {
                    capturedCallback = cb;
                    return { data: { subscription: { unsubscribe: vi.fn() } } };
                }),
            });

            await service.initialize();
            expect(service.session()).toBeNull();

            capturedCallback!('SIGNED_IN', session);
            expect(service.session()).toEqual(session);
        });
    });

    describe('user computed signal', () => {
        it('returns null when session is null', async () => {
            const { service } = setup();
            await service.initialize();
            expect(service.user()).toBeNull();
        });

        it('returns the user from the current session', async () => {
            const session = makeSession();
            const { service } = setup({
                getSession: vi.fn().mockResolvedValue({ data: { session } }),
            });
            await service.initialize();
            expect(service.user()).toEqual(session.user);
        });
    });

    describe('signIn()', () => {
        it('calls signInWithPassword with provided credentials', async () => {
            const { service, fakeSupabase } = setup();
            await service.signIn('a@b.com', 'pass123');
            expect(fakeSupabase.client.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'a@b.com',
                password: 'pass123',
            });
        });

        it('returns { error: null } on success', async () => {
            const { service } = setup();
            const result = await service.signIn('a@b.com', 'pass123');
            expect(result.error).toBeNull();
        });

        it('returns the error on failure', async () => {
            const err = new Error('Invalid credentials');
            const { service } = setup({
                signInWithPassword: vi.fn().mockResolvedValue({ error: err }),
            });
            const result = await service.signIn('a@b.com', 'wrong');
            expect(result.error).toBe(err);
        });
    });

    describe('signUp()', () => {
        it('passes full_name via raw_user_meta_data', async () => {
            const { service, fakeSupabase } = setup();
            await service.signUp('a@b.com', 'pass123', 'Alice');
            expect(fakeSupabase.client.auth.signUp).toHaveBeenCalledWith({
                email: 'a@b.com',
                password: 'pass123',
                options: { data: { full_name: 'Alice' } },
            });
        });

        it('returns { error: null } on success', async () => {
            const { service } = setup();
            const result = await service.signUp('a@b.com', 'pass', 'Bob');
            expect(result.error).toBeNull();
        });
    });

    describe('signOut()', () => {
        it('calls supabase signOut', async () => {
            const { service, fakeSupabase } = setup();
            await service.initialize();
            await service.signOut();
            expect(fakeSupabase.client.auth.signOut).toHaveBeenCalledOnce();
        });

        it('navigates to /auth/login', async () => {
            const { service, routerSpy } = setup();
            await service.initialize();
            await service.signOut();
            expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login']);
        });
    });

    describe('resetPasswordForEmail()', () => {
        it('calls Supabase with the email and correct redirectTo', async () => {
            const { service, fakeSupabase } = setup();
            await service.resetPasswordForEmail('a@b.com');
            expect(fakeSupabase.client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
                'a@b.com',
                expect.objectContaining({ redirectTo: expect.stringContaining('/auth/update-password') }),
            );
        });

        it('returns { error: null } on success', async () => {
            const { service } = setup();
            const result = await service.resetPasswordForEmail('a@b.com');
            expect(result.error).toBeNull();
        });
    });

    describe('updatePassword()', () => {
        it('calls updateUser with the new password', async () => {
            const { service, fakeSupabase } = setup();
            await service.updatePassword('newpass');
            expect(fakeSupabase.client.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass' });
        });

        it('returns { error: null } on success', async () => {
            const { service } = setup();
            const result = await service.updatePassword('newpass');
            expect(result.error).toBeNull();
        });
    });
});

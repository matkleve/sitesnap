/**
 * AuthService — single source of truth for authentication state.
 *
 * Ground rules:
 *  - This service owns the session signal. Nothing else reads auth.users directly.
 *  - All Supabase auth calls go through this service. Components never call
 *    supabase.client.auth directly.
 *  - Session state is loaded once at startup via initialize(), which is called
 *    by APP_INITIALIZER before the first route renders.
 *  - The session signal is null until initialize() resolves — guards wait for it.
 *  - Errors are returned as { error } objects; this service never throws.
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type AuthResult = { error: AuthError | Error | null };

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly supabase = inject(SupabaseService);
    private readonly router = inject(Router);

    // ─── Reactive state ────────────────────────────────────────────────────────

    /** Current Supabase session. null = unauthenticated or not yet loaded. */
    readonly session = signal<Session | null>(null);

    /** Shortcut: the authenticated user from the current session. */
    readonly user = computed<User | null>(() => this.session()?.user ?? null);

    /** True while initialize() is still resolving. Guards use this to wait. */
    readonly loading = signal<boolean>(true);

    // ─── Lifecycle ──────────────────────────────────────────────────────────────

    /**
     * Called once at app startup (via APP_INITIALIZER).
     * Loads the persisted session and subscribes to future auth state changes.
     * Must resolve before any route guard runs.
     */
    async initialize(): Promise<void> {
        // Load any existing session from storage
        const { data } = await this.supabase.client.auth.getSession();
        this.session.set(data.session);

        // Subscribe to auth state changes for the lifetime of the app.
        // This fires on: sign-in, sign-out, token refresh, password recovery.
        this.supabase.client.auth.onAuthStateChange((event, session) => {
            this.session.set(session);

            // After a PASSWORD_RECOVERY link is clicked, Supabase fires SIGNED_IN
            // with type 'recovery'. Route the user to the update-password form.
            if (event === 'PASSWORD_RECOVERY') {
                this.router.navigate(['/auth/update-password']);
            }
        });

        this.loading.set(false);
    }

    // ─── Auth actions ───────────────────────────────────────────────────────────

    /**
     * Sign in with email + password.
     * On success the session signal updates automatically via onAuthStateChange.
     */
    async signIn(email: string, password: string): Promise<AuthResult> {
        const { error } = await this.supabase.client.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    }

    /**
     * Register a new user.
     * Supabase sends a confirmation email by default.
     * The handle_new_user trigger fires on the server side to create the profile row.
     *
     * full_name is passed via raw_user_meta_data so the trigger can pick it up.
     */
    async signUp(
        email: string,
        password: string,
        fullName: string,
    ): Promise<AuthResult> {
        const { error } = await this.supabase.client.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName },
            },
        });
        return { error };
    }

    /**
     * Sign out the current user.
     * Clears the Supabase session from storage and updates the session signal.
     * Redirects to /auth/login after sign-out.
     */
    async signOut(): Promise<void> {
        await this.supabase.client.auth.signOut();
        // session signal is set to null by onAuthStateChange
        this.router.navigate(['/auth/login']);
    }

    /**
     * Send a password reset email.
     * The email contains a magic link pointing to the app's /auth/update-password route.
     * The redirectTo URL must be in the Supabase allowed-redirects list.
     */
    async resetPasswordForEmail(email: string): Promise<AuthResult> {
        const { error } = await this.supabase.client.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: `${window.location.origin}/auth/update-password`,
            },
        );
        return { error };
    }

    /**
     * Set a new password after the user has clicked their reset link.
     * Only works when the user has an active recovery session.
     */
    async updatePassword(newPassword: string): Promise<AuthResult> {
        const { error } = await this.supabase.client.auth.updateUser({
            password: newPassword,
        });
        return { error };
    }
}

/**
 * LoginComponent — email/password sign-in form.
 *
 * Ground rules:
 *  - This component only coordinates UI. All auth logic lives in AuthService.
 *  - On success, the router navigates to /. Navigation is triggered by the
 *    app-level session signal change, not by this component directly.
 *  - Error messages come from Supabase and are displayed as-is (they are
 *    user-safe strings like "Invalid login credentials").
 */

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

@Component({
    selector: 'app-login',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss',
})
export class LoginComponent {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    // Form definition — both fields required; email must be valid format
    protected readonly form = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
    });

    protected readonly loading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected async submit(): Promise<void> {
        if (this.form.invalid) return;

        this.loading.set(true);
        this.errorMessage.set(null);

        const { email, password } = this.form.getRawValue();
        const { error } = await this.auth.signIn(email, password);

        if (error) {
            this.errorMessage.set(error.message);
            this.loading.set(false);
            return;
        }

        // On success: onAuthStateChange in AuthService updates the session signal.
        // The authGuard on / will now pass through.
        this.router.navigate(['/']);
    }
}

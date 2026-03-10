/**
 * ResetPasswordComponent — sends a password reset email.
 *
 * Ground rules:
 *  - Only asks for email. No other fields.
 *  - On success, shows a confirmation message. Does NOT navigate away — the
 *    user needs to check their email and click the link.
 *  - The reset link redirects to /auth/update-password. That URL must be in
 *    the Supabase allowed-redirect-URLs list in the dashboard.
 */

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

@Component({
    selector: 'app-reset-password',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './reset-password.component.html',
    styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);

    protected readonly form = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
    });

    protected readonly loading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);
    protected readonly success = signal(false);

    protected async submit(): Promise<void> {
        if (this.form.invalid) return;

        this.loading.set(true);
        this.errorMessage.set(null);

        const { email } = this.form.getRawValue();
        const { error } = await this.auth.resetPasswordForEmail(email);

        if (error) {
            this.errorMessage.set(error.message);
            this.loading.set(false);
            return;
        }

        this.success.set(true);
        this.loading.set(false);
    }
}

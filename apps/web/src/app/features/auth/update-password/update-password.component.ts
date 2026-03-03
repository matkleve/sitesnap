/**
 * UpdatePasswordComponent — set a new password after clicking a reset link.
 *
 * Ground rules:
 *  - The user arrives here via a Supabase magic link (from their email).
 *    Supabase sets a temporary recovery session automatically.
 *  - AuthService.initialize() handles the PASSWORD_RECOVERY event and routes
 *    the user here. This component only needs to call updatePassword().
 *  - On success, navigate to /auth/login — the recovery session expires after
 *    the password is changed, so the user must sign in again.
 */

import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordsMismatch: true };
}

@Component({
    selector: 'app-update-password',
    imports: [ReactiveFormsModule],
    templateUrl: './update-password.component.html',
    styleUrl: './update-password.component.scss',
})
export class UpdatePasswordComponent {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    protected readonly form = this.fb.nonNullable.group(
        {
            password: ['', [Validators.required, Validators.minLength(6)]],
            confirmPassword: ['', Validators.required],
        },
        { validators: passwordsMatch },
    );

    protected readonly loading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected async submit(): Promise<void> {
        if (this.form.invalid) return;

        this.loading.set(true);
        this.errorMessage.set(null);

        const { password } = this.form.getRawValue();
        const { error } = await this.auth.updatePassword(password);

        if (error) {
            this.errorMessage.set(error.message);
            this.loading.set(false);
            return;
        }

        // Recovery session is now consumed — redirect to login
        this.router.navigate(['/auth/login']);
    }
}

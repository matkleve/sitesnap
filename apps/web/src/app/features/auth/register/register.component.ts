/**
 * RegisterComponent — new user sign-up form.
 *
 * Ground rules:
 *  - Full name is captured here and passed to Supabase as raw_user_meta_data.
 *    The handle_new_user trigger on the DB picks it up and writes it to profiles.
 *  - On success, Supabase sends a confirmation email by default. We show a
 *    "check your email" state instead of immediately navigating into the app.
 *  - Password confirmation is validated client-side only (it never goes to the server).
 */

import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

/** Custom validator: both password fields must match. */
function passwordsMatch(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordsMismatch: true };
}

@Component({
    selector: 'app-register',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrl: './register.component.scss',
})
export class RegisterComponent {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);

    protected readonly form = this.fb.nonNullable.group(
        {
            fullName: ['', [Validators.required, Validators.minLength(2)]],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]],
            confirmPassword: ['', Validators.required],
        },
        { validators: passwordsMatch },
    );

    protected readonly loading = signal(false);
    protected readonly errorMessage = signal<string | null>(null);
    protected readonly success = signal(false);

    protected async submit(): Promise<void> {
        if (this.form.invalid) return;

        this.loading.set(true);
        this.errorMessage.set(null);

        const { fullName, email, password } = this.form.getRawValue();
        const { error } = await this.auth.signUp(email, password, fullName);

        if (error) {
            this.errorMessage.set(error.message);
            this.loading.set(false);
            return;
        }

        // Supabase sends a confirmation email — show a success message, don't navigate
        this.success.set(true);
        this.loading.set(false);
    }
}

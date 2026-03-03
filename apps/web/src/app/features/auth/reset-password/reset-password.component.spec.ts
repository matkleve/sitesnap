/**
 * ResetPasswordComponent unit tests.
 *
 * Strategy:
 *  - AuthService.resetPasswordForEmail is faked.
 *  - Success state shows a "Check your email" confirmation.
 *  - Error state renders the Supabase error message.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../core/auth.service';

function buildFakeAuth(resetError: Error | null = null) {
    return {
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: resetError }),
    };
}

function setup(resetError: Error | null = null) {
    const fakeAuth = buildFakeAuth(resetError);

    TestBed.configureTestingModule({
        imports: [ResetPasswordComponent],
        providers: [
            { provide: AuthService, useValue: fakeAuth },
            provideRouter([], withNavigationErrorHandler(() => { })),
        ],
    });

    const fixture = TestBed.createComponent(ResetPasswordComponent);
    fixture.detectChanges();

    return { fixture, fakeAuth };
}

describe('ResetPasswordComponent', () => {
    it('creates', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('form is invalid with empty email', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance['form'].invalid).toBe(true);
    });

    it('form is invalid with non-email string', () => {
        const { fixture } = setup();
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector<HTMLInputElement>('#email')!;
        input.value = 'not-an-email';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(fixture.componentInstance['form'].invalid).toBe(true);
    });

    it('form is valid with a valid email', () => {
        const { fixture } = setup();
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector<HTMLInputElement>('#email')!;
        input.value = 'user@example.com';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(fixture.componentInstance['form'].valid).toBe(true);
    });

    it('calls resetPasswordForEmail with the provided email', async () => {
        const { fixture, fakeAuth } = setup();
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector<HTMLInputElement>('#email')!;
        input.value = 'user@example.com';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        el.querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        expect(fakeAuth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('shows success confirmation after submitting', async () => {
        const { fixture } = setup();
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector<HTMLInputElement>('#email')!;
        input.value = 'user@example.com';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        el.querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fixture.componentInstance['success']()).toBe(true);
    });

    it('shows error message when reset fails', async () => {
        const err = new Error('Email not found');
        const { fixture } = setup(err);
        const el = fixture.nativeElement as HTMLElement;
        const input = el.querySelector<HTMLInputElement>('#email')!;
        input.value = 'user@example.com';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        el.querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
        const alert = el.querySelector('.alert-error');
        expect(alert?.textContent).toContain('Email not found');
    });
});

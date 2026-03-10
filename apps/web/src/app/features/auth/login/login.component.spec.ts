/**
 * LoginComponent unit tests.
 *
 * Strategy:
 *  - AuthService replaced with a fake; provideRouter([]) satisfies RouterLink deps.
 *  - Form interaction is tested via native element inputs + dispatchEvent to trigger
 *    Angular's reactive-form change detection.
 *  - Router.navigate is spied on to verify post-login navigation.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withNavigationErrorHandler } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/auth.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildFakeAuth(signInError: Error | null = null) {
    return {
        signIn: vi.fn().mockResolvedValue({ error: signInError }),
    };
}

function setup(signInError: Error | null = null) {
    const fakeAuth = buildFakeAuth(signInError);

    TestBed.configureTestingModule({
        imports: [LoginComponent],
        providers: [
            { provide: AuthService, useValue: fakeAuth },
            provideRouter([], withNavigationErrorHandler(() => { })),
        ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    return { fixture, fakeAuth };
}

function fillForm(fixture: ReturnType<typeof setup>['fixture'], email: string, password: string) {
    const el: HTMLElement = fixture.nativeElement;

    const emailInput = el.querySelector<HTMLInputElement>('#email')!;
    const passwordInput = el.querySelector<HTMLInputElement>('#password')!;

    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));

    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LoginComponent', () => {
    it('creates', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the Sign in heading', () => {
        const { fixture } = setup();
        const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
        expect(h1?.textContent).toContain('Sign in');
    });

    it('renders map background container', () => {
        const { fixture } = setup();
        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.auth-shell--map')).toBeTruthy();
        expect(host.querySelector('.auth-map-frame')).toBeTruthy();
    });

    it('form is invalid when empty', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance['form'].invalid).toBe(true);
    });

    it('form is valid with valid email and password', () => {
        const { fixture } = setup();
        fillForm(fixture, 'user@example.com', 'password123');
        expect(fixture.componentInstance['form'].valid).toBe(true);
    });

    it('does NOT call signIn when form is invalid', async () => {
        const { fixture, fakeAuth } = setup();
        const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type=submit]')!;
        button.click();
        await fixture.whenStable();
        expect(fakeAuth.signIn).not.toHaveBeenCalled();
    });

    it('calls authService.signIn with correct credentials', async () => {
        const { fixture, fakeAuth } = setup();
        fillForm(fixture, 'user@example.com', 'secret1');
        const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
        form.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        expect(fakeAuth.signIn).toHaveBeenCalledWith('user@example.com', 'secret1');
    });

    it('navigates to / on successful sign in', async () => {
        const { fixture } = setup();
        const router = TestBed.inject(Router);
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        fillForm(fixture, 'user@example.com', 'secret1');
        (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        expect(navigateSpy).toHaveBeenCalledWith(['/']);
    });

    it('displays error message when signIn fails', async () => {
        const err = new Error('Invalid login credentials');
        const { fixture } = setup(err);
        fillForm(fixture, 'user@example.com', 'wrong-pw'); // ≥ 6 chars to pass minLength
        (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
        const alert = (fixture.nativeElement as HTMLElement).querySelector('.alert-error');
        expect(alert?.textContent).toContain('Invalid login credentials');
    });
});

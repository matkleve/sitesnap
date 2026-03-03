/**
 * UpdatePasswordComponent unit tests.
 *
 * Strategy:
 *  - AuthService.updatePassword is faked.
 *  - Router.navigate is spied on to assert /auth/login redirect on success.
 *  - Password-match validation is tested (reuses the same pattern as RegisterComponent).
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UpdatePasswordComponent } from './update-password.component';
import { AuthService } from '../../../core/auth.service';

function buildFakeAuth(updateError: Error | null = null) {
    return {
        updatePassword: vi.fn().mockResolvedValue({ error: updateError }),
    };
}

function setup(updateError: Error | null = null) {
    const fakeAuth = buildFakeAuth(updateError);
    // Use a mock router — UpdatePasswordComponent has no RouterLink, so a real
    // router is not needed and avoids NG04002 from dangling post-test navigations.
    const routerMock = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
        imports: [UpdatePasswordComponent],
        providers: [
            { provide: AuthService, useValue: fakeAuth },
            { provide: Router, useValue: routerMock },
        ],
    });

    const fixture = TestBed.createComponent(UpdatePasswordComponent);
    fixture.detectChanges();

    return { fixture, fakeAuth };
}

function fillForm(
    fixture: ReturnType<typeof setup>['fixture'],
    password: string,
    confirmPassword: string,
) {
    const el: HTMLElement = fixture.nativeElement;

    const pwInput = el.querySelector<HTMLInputElement>('#password')!;
    pwInput.value = password;
    pwInput.dispatchEvent(new Event('input'));

    const confirmInput = el.querySelector<HTMLInputElement>('#confirmPassword')!;
    confirmInput.value = confirmPassword;
    confirmInput.dispatchEvent(new Event('input'));

    fixture.detectChanges();
}

describe('UpdatePasswordComponent', () => {
    it('creates', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the Set new password heading', () => {
        const { fixture } = setup();
        const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
        expect(h1?.textContent).toContain('Set new password');
    });

    it('form is invalid when empty', () => {
        const { fixture } = setup();
        expect(fixture.componentInstance['form'].invalid).toBe(true);
    });

    it('form is invalid when passwords do not match', () => {
        const { fixture } = setup();
        fillForm(fixture, 'newpass1', 'different');
        expect(fixture.componentInstance['form'].invalid).toBe(true);
        expect(fixture.componentInstance['form'].hasError('passwordsMismatch')).toBe(true);
    });

    it('form is valid when passwords match and meet length', () => {
        const { fixture } = setup();
        fillForm(fixture, 'newpass1', 'newpass1');
        expect(fixture.componentInstance['form'].valid).toBe(true);
    });

    it('calls updatePassword with the new password', async () => {
        const { fixture, fakeAuth } = setup();
        fillForm(fixture, 'newpass1', 'newpass1');
        (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        expect(fakeAuth.updatePassword).toHaveBeenCalledWith('newpass1');
    });

    it('navigates to /auth/login on success', async () => {
        const { fixture } = setup();
        const router = TestBed.inject(Router);
        fillForm(fixture, 'newpass1', 'newpass1');
        (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('displays error message when update fails', async () => {
        const err = new Error('New password should be different from the old password');
        const { fixture } = setup(err);
        fillForm(fixture, 'newpass1', 'newpass1');
        (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
        const alert = (fixture.nativeElement as HTMLElement).querySelector('.alert-error');
        expect(alert?.textContent).toContain('New password should be different');
    });
});

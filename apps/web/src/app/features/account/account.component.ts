/**
 * AccountComponent — placeholder for the /account page.
 * Will be fully implemented in M-UI9.
 */
import { Component } from '@angular/core';

@Component({
    selector: 'app-account',
    standalone: true,
    imports: [],
    template: `
        <div class="page-placeholder">
            <h1>Account</h1>
            <p>Profile & account management — coming in M-UI9.</p>
        </div>
    `,
    styles: [`
        .page-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 0.5rem;
            color: var(--color-text-secondary);
        }
        h1 { color: var(--color-text-primary); }
    `],
})
export class AccountComponent { }

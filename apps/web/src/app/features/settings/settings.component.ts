/**
 * SettingsComponent — placeholder for the /settings page.
 * Will be fully implemented in M-UI8.
 */
import { Component } from '@angular/core';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [],
    template: `
        <div class="page-placeholder">
            <h1>Settings</h1>
            <p>App preferences — coming in M-UI8.</p>
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
export class SettingsComponent { }

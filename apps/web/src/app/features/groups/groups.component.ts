/**
 * GroupsComponent — placeholder for the /groups page.
 * Will be fully implemented in M-UI7.
 */
import { Component } from '@angular/core';

@Component({
    selector: 'app-groups',
    standalone: true,
    imports: [],
    template: `
        <div class="page-placeholder">
            <h1>Groups</h1>
            <p>Saved groups — coming in M-UI7.</p>
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
export class GroupsComponent { }

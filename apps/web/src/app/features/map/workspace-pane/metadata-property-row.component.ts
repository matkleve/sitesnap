/**
 * MetadataPropertyRowComponent — single click-to-edit property row.
 *
 * Follows the Notion pattern: the value cell is a plain text span at rest;
 * clicking it swaps in an <input> that commits on Enter or blur.
 * No separate "Edit" button — the row itself is the affordance.
 */

import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-metadata-property-row',
  standalone: true,
  template: `
    <div class="prop-row" [class.prop-row--editing]="editing()">
      <span class="prop-key" [title]="metaKey()">{{ metaKey() }}</span>
      @if (editing()) {
        <input
          #editInput
          class="prop-input"
          type="text"
          [value]="metaValue()"
          aria-label="Edit {{ metaKey() }}"
          (keydown.enter)="commitEdit($event)"
          (keydown.escape)="cancelEdit()"
          (blur)="commitEdit($event)"
        />
      } @else {
        <button
          class="prop-value"
          type="button"
          [title]="'Edit ' + metaKey()"
          (click)="startEdit()"
        >
          {{ metaValue() || '—' }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .prop-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        min-height: 2.5rem;
        padding-block: var(--spacing-2);
        padding-inline: var(--spacing-3);
        gap: var(--spacing-2);
        border-bottom: 1px solid var(--color-border);
        transition: background 80ms ease-out;

        &:hover,
        &--editing {
          background: color-mix(in srgb, var(--color-bg-base) 60%, transparent);
        }
      }

      .prop-key {
        font-size: 0.8125rem; /* --text-small */
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .prop-value {
        font-size: 0.9375rem; /* --text-body */
        color: var(--color-text-primary);
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
        line-height: 1.55;
        width: 100%;

        &:hover {
          color: var(--color-primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      }

      .prop-input {
        font-size: 0.9375rem; /* --text-body */
        color: var(--color-text-primary);
        background: var(--color-bg-surface);
        border: 1px solid var(--color-primary);
        border-radius: var(--radius-sm);
        padding: 0.125rem var(--spacing-2);
        width: 100%;
        text-align: right;
        font-family: inherit;
        outline: none;
        box-shadow: var(--shadow-focus);
      }
    `,
  ],
})
export class MetadataPropertyRowComponent {
  readonly metaKey = input.required<string>({ alias: 'key' });
  readonly metaValue = input.required<string>({ alias: 'value' });
  readonly valueChanged = output<string>();

  readonly editing = signal(false);

  private readonly editInputRef = viewChild<ElementRef<HTMLInputElement>>('editInput');

  startEdit(): void {
    this.editing.set(true);
    // Focus the input after the @if renders it
    queueMicrotask(() => this.editInputRef()?.nativeElement.focus());
  }

  commitEdit(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newValue = input.value.trim();
    this.valueChanged.emit(newValue);
    this.editing.set(false);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }
}

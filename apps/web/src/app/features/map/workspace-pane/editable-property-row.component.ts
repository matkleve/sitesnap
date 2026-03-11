/**
 * EditablePropertyRowComponent — click-to-edit property row for image fields.
 *
 * Supports three input types:
 *  - 'text' — inline text input (default)
 *  - 'date' — datetime-local input
 *  - 'select' — dropdown with options
 *
 * Follows the Notion pattern: click the value → inline edit → commit on Enter/blur.
 * Escape discards changes.
 */

import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

export interface SelectOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-editable-property-row',
  standalone: true,
  template: `
    <div
      class="prop-row"
      [class.prop-row--editing]="editing()"
      [class.prop-row--readonly]="readonly()"
    >
      <span class="prop-key" [title]="label()">{{ label() }}</span>
      @if (editing() && !readonly()) {
        @switch (inputType()) {
          @case ('date') {
            <input
              #editInput
              class="prop-input"
              type="datetime-local"
              [value]="dateInputValue()"
              [attr.aria-label]="'Edit ' + label()"
              (keydown.enter)="commitEdit($event)"
              (keydown.escape)="cancelEdit()"
              (blur)="commitEdit($event)"
            />
          }
          @case ('select') {
            <select
              #editInput
              class="prop-input prop-input--select"
              [attr.aria-label]="'Edit ' + label()"
              (change)="commitSelect($event)"
              (keydown.escape)="cancelEdit()"
              (blur)="commitSelect($event)"
            >
              <option value="">— None —</option>
              @for (opt of options(); track opt.id) {
                <option [value]="opt.id" [selected]="opt.id === value()">{{ opt.label }}</option>
              }
            </select>
          }
          @default {
            <input
              #editInput
              class="prop-input"
              type="text"
              [value]="value()"
              [attr.aria-label]="'Edit ' + label()"
              (keydown.enter)="commitEdit($event)"
              (keydown.escape)="cancelEdit()"
              (blur)="commitEdit($event)"
            />
          }
        }
      } @else {
        <button
          class="prop-value"
          type="button"
          [title]="readonly() ? label() : 'Edit ' + label()"
          [disabled]="readonly()"
          (click)="startEdit()"
        >
          {{ displayValue() || '—' }}
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

        &:hover:not(.prop-row--readonly),
        &--editing {
          background: color-mix(in srgb, var(--color-bg-base) 60%, transparent);
        }

        &--readonly {
          pointer-events: none;
        }
      }

      .prop-key {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .prop-value {
        font-size: 0.9375rem;
        color: var(--color-text-primary);
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background: none;
        border: none;
        border-bottom: 1px dashed transparent;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
        line-height: 1.55;
        width: 100%;
        transition:
          border-color 80ms ease-out,
          color 80ms ease-out;

        &:hover:not(:disabled) {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
        }

        &:disabled {
          cursor: default;
          opacity: 0.7;
        }
      }

      .prop-input {
        font-size: 0.9375rem;
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

        &--select {
          cursor: pointer;
          appearance: auto;
        }
      }
    `,
  ],
})
export class EditablePropertyRowComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly displayValue = input<string>('');
  readonly inputType = input<'text' | 'date' | 'select'>('text');
  readonly options = input<SelectOption[]>([]);
  readonly readonly = input(false);
  readonly valueChanged = output<string>();

  readonly editing = signal(false);

  private readonly editInputRef =
    viewChild<ElementRef<HTMLInputElement | HTMLSelectElement>>('editInput');

  /** Convert an ISO date string to datetime-local format for the input. */
  dateInputValue(): string {
    const v = this.value();
    if (!v) return '';
    try {
      const d = new Date(v);
      // datetime-local needs YYYY-MM-DDTHH:MM format (local time, not UTC)
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  }

  startEdit(): void {
    if (this.readonly()) return;
    this.editing.set(true);
    queueMicrotask(() => this.editInputRef()?.nativeElement.focus());
  }

  commitEdit(event: Event): void {
    const input = event.target as HTMLInputElement;
    let newValue = input.value.trim();
    if (this.inputType() === 'date' && newValue) {
      // Convert datetime-local back to ISO string
      newValue = new Date(newValue).toISOString();
    }
    this.valueChanged.emit(newValue);
    this.editing.set(false);
  }

  commitSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.valueChanged.emit(select.value);
    this.editing.set(false);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }
}

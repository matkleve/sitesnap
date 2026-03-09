import { Component, signal } from '@angular/core';

interface FilterRule {
  id: string;
  conjunction: 'where' | 'and' | 'or';
  property: string;
  operator: string;
  value: string;
}

let nextRuleId = 0;

@Component({
  selector: 'app-filter-dropdown',
  template: `
    <div class="filter-dropdown">
      @if (rules().length === 0) {
        <div class="filter-empty">No filters applied</div>
      } @else {
        <div class="filter-rules">
          @for (rule of rules(); track rule.id; let i = $index) {
            <div class="filter-rule">
              <button class="filter-rule__conj" (click)="toggleConjunction(rule.id)">
                {{ i === 0 ? 'Where' : rule.conjunction === 'and' ? 'And' : 'Or' }}
              </button>
              <select
                class="filter-rule__select"
                [value]="rule.property"
                (change)="updateProperty(rule.id, $any($event.target).value)"
              >
                <option value="" disabled>Property</option>
                @for (prop of propertyOptions; track prop) {
                  <option [value]="prop">{{ prop }}</option>
                }
              </select>
              <select
                class="filter-rule__select"
                [value]="rule.operator"
                (change)="updateOperator(rule.id, $any($event.target).value)"
              >
                <option value="" disabled>Operator</option>
                @for (op of operatorOptions; track op) {
                  <option [value]="op">{{ op }}</option>
                }
              </select>
              <input
                class="filter-rule__value"
                type="text"
                placeholder="Value…"
                [value]="rule.value"
                (input)="updateValue(rule.id, $any($event.target).value)"
              />
              <button
                class="filter-rule__remove"
                (click)="removeRule(rule.id)"
                aria-label="Remove filter"
              >
                <span class="material-icons">close</span>
              </button>
            </div>
          }
        </div>
      }
      <button class="filter-add" (click)="addRule()">
        <span class="material-icons">add</span>
        Add a filter
      </button>
    </div>
  `,
  styleUrl: './filter-dropdown.component.scss',
})
export class FilterDropdownComponent {
  readonly propertyOptions = ['Date', 'Project', 'City', 'Country', 'Address', 'User'];
  readonly operatorOptions = ['contains', 'equals', 'is', 'is not', 'before', 'after'];

  readonly rules = signal<FilterRule[]>([]);

  addRule(): void {
    this.rules.update((list) => [
      ...list,
      {
        id: `rule-${++nextRuleId}`,
        conjunction: list.length === 0 ? 'where' : 'and',
        property: '',
        operator: '',
        value: '',
      },
    ]);
  }

  removeRule(id: string): void {
    this.rules.update((list) => list.filter((r) => r.id !== id));
  }

  toggleConjunction(id: string): void {
    this.rules.update((list) =>
      list.map((r) =>
        r.id === id ? { ...r, conjunction: r.conjunction === 'and' ? 'or' : 'and' } : r,
      ),
    );
  }

  updateProperty(id: string, value: string): void {
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, property: value } : r)));
  }

  updateOperator(id: string, value: string): void {
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, operator: value } : r)));
  }

  updateValue(id: string, value: string): void {
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, value: value } : r)));
  }
}

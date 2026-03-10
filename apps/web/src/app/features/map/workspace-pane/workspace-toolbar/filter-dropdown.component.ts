import { Component, inject } from '@angular/core';
import { FilterService } from '../../../../core/filter.service';

@Component({
  selector: 'app-filter-dropdown',
  template: `
    <div class="filter-dropdown">
      @if (filterService.rules().length === 0) {
        <div class="filter-empty">No filters applied</div>
      } @else {
        <div class="filter-rules">
          @for (rule of filterService.rules(); track rule.id; let i = $index) {
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
      <button class="filter-add" (click)="filterService.addRule()">
        <span class="material-icons">add</span>
        Add a filter
      </button>
    </div>
  `,
  styleUrl: './filter-dropdown.component.scss',
})
export class FilterDropdownComponent {
  protected readonly filterService = inject(FilterService);

  readonly propertyOptions = ['Date', 'Project', 'City', 'Country', 'Address', 'User'];
  readonly operatorOptions = ['contains', 'equals', 'is', 'is not', 'before', 'after'];

  removeRule(id: string): void {
    this.filterService.removeRule(id);
  }

  toggleConjunction(id: string): void {
    const rules = this.filterService.rules();
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      this.filterService.updateRule(id, {
        conjunction: rule.conjunction === 'and' ? 'or' : 'and',
      });
    }
  }

  updateProperty(id: string, value: string): void {
    this.filterService.updateRule(id, { property: value });
  }

  updateOperator(id: string, value: string): void {
    this.filterService.updateRule(id, { operator: value });
  }

  updateValue(id: string, value: string): void {
    this.filterService.updateRule(id, { value });
  }
}

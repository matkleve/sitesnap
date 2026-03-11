import { Component, computed, inject } from '@angular/core';
import { FilterService } from '../../../../core/filter.service';
import { PropertyRegistryService } from '../../../../core/property-registry.service';
import type { PropertyType } from '../../../../core/property-registry.types';

const TEXT_OPERATORS = ['contains', 'equals', 'is', 'is not', 'before', 'after'];
const NUMBER_OPERATORS = ['=', '≠', '>', '<', '≥', '≤'];
const DATE_OPERATORS = ['is', 'is not', 'before', 'after'];

function operatorsForType(type: PropertyType | undefined): string[] {
  switch (type) {
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}

@Component({
  selector: 'app-filter-dropdown',
  template: `
    <div class="filter-dropdown">
      @if (filterService.rules().length === 0) {
        <div class="dd-empty">No filters applied</div>
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
                @for (prop of propertyOptions(); track prop.id) {
                  <option [value]="prop.id">{{ prop.label }}</option>
                }
              </select>
              <select
                class="filter-rule__select"
                [value]="rule.operator"
                (change)="updateOperator(rule.id, $any($event.target).value)"
              >
                <option value="" disabled>Operator</option>
                @for (op of getOperatorsForRule(rule.property); track op) {
                  <option [value]="op">{{ op }}</option>
                }
              </select>
              <input
                class="filter-rule__value"
                [type]="getInputType(rule.property)"
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
      <button class="dd-action-row" (click)="filterService.addRule()">
        <span class="material-icons">add</span>
        Add a filter
      </button>
    </div>
  `,
  styleUrl: './filter-dropdown.component.scss',
})
export class FilterDropdownComponent {
  protected readonly filterService = inject(FilterService);
  private readonly registry = inject(PropertyRegistryService);

  readonly propertyOptions = computed(() =>
    this.registry.filterableProperties().map((p) => ({ id: p.id, label: p.label })),
  );

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
    // When property changes, reset operator if it's not valid for the new type
    const prop = this.registry.getProperty(value);
    const validOps = operatorsForType(prop?.type);
    const rules = this.filterService.rules();
    const rule = rules.find((r) => r.id === id);
    const patch: Record<string, string> = { property: value };
    if (rule && !validOps.includes(rule.operator)) {
      patch['operator'] = '';
    }
    this.filterService.updateRule(id, patch);
  }

  updateOperator(id: string, value: string): void {
    this.filterService.updateRule(id, { operator: value });
  }

  updateValue(id: string, value: string): void {
    this.filterService.updateRule(id, { value });
  }

  getOperatorsForRule(propertyId: string): string[] {
    if (!propertyId) return TEXT_OPERATORS;
    const prop = this.registry.getProperty(propertyId);
    return operatorsForType(prop?.type);
  }

  getInputType(propertyId: string): string {
    if (!propertyId) return 'text';
    const prop = this.registry.getProperty(propertyId);
    return prop?.type === 'number' ? 'number' : 'text';
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import type { FilterRule, WorkspaceImage } from './workspace-view.types';
import { PropertyRegistryService } from './property-registry.service';

let nextRuleId = 0;

@Injectable({ providedIn: 'root' })
export class FilterService {
  private readonly registry = inject(PropertyRegistryService);
  readonly rules = signal<FilterRule[]>([]);

  readonly activeCount = computed(() => this.rules().length);

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

  updateRule(id: string, patch: Partial<FilterRule>): void {
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  removeRule(id: string): void {
    this.rules.update((list) => list.filter((r) => r.id !== id));
  }

  clearAll(): void {
    this.rules.set([]);
  }

  /**
   * Tests whether a single image passes all filter rules.
   * Uses AND/OR conjunction logic across the rule list.
   */
  matchesClientSide(image: WorkspaceImage, rules: FilterRule[]): boolean {
    if (rules.length === 0) return true;

    // Evaluate rules respecting AND/OR conjunction.
    // The first rule's conjunction is always 'where' (treated as AND start).
    let result = this.evaluateRule(image, rules[0]);

    for (let i = 1; i < rules.length; i++) {
      const rule = rules[i];
      const ruleResult = this.evaluateRule(image, rule);
      if (rule.conjunction === 'or') {
        result = result || ruleResult;
      } else {
        result = result && ruleResult;
      }
    }

    return result;
  }

  private evaluateRule(image: WorkspaceImage, rule: FilterRule): boolean {
    if (!rule.property || !rule.operator) return true;

    const fieldValue = this.getFieldValue(image, rule.property);
    const ruleValue = rule.value.toLowerCase();

    if (fieldValue == null) {
      return rule.operator === 'is not' || rule.operator === '≠' ? ruleValue !== '' : false;
    }

    const fieldStr = String(fieldValue).toLowerCase();

    // Numeric operators — compare as numbers
    const numericOps = ['=', '≠', '>', '<', '≥', '≤'];
    if (numericOps.includes(rule.operator)) {
      const numField = parseFloat(fieldStr);
      const numRule = parseFloat(ruleValue);
      if (Number.isNaN(numField) || Number.isNaN(numRule)) return false;
      switch (rule.operator) {
        case '=':
          return numField === numRule;
        case '≠':
          return numField !== numRule;
        case '>':
          return numField > numRule;
        case '<':
          return numField < numRule;
        case '≥':
          return numField >= numRule;
        case '≤':
          return numField <= numRule;
        default:
          return true;
      }
    }

    switch (rule.operator) {
      case 'contains':
        return fieldStr.includes(ruleValue);
      case 'equals':
      case 'is':
        return fieldStr === ruleValue;
      case 'is not':
        return fieldStr !== ruleValue;
      case 'before':
        return fieldStr < ruleValue;
      case 'after':
        return fieldStr > ruleValue;
      default:
        return true;
    }
  }

  private getFieldValue(image: WorkspaceImage, property: string): string | null {
    const val = this.registry.getFieldValue(image, property);
    return val != null ? String(val) : null;
  }
}

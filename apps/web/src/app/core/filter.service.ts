import { Injectable, computed, signal } from '@angular/core';
import type { FilterRule, WorkspaceImage } from './workspace-view.types';

let nextRuleId = 0;

@Injectable({ providedIn: 'root' })
export class FilterService {
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
      return rule.operator === 'is not' ? ruleValue !== '' : false;
    }

    const fieldStr = String(fieldValue).toLowerCase();

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
    switch (property.toLowerCase()) {
      case 'date':
        return image.capturedAt;
      case 'project':
        return image.projectName;
      case 'address':
        return image.addressLabel;
      case 'city':
        return image.city;
      case 'district':
        return image.district;
      case 'street':
        return image.street;
      case 'country':
        return image.country;
      case 'user':
        return image.userName;
      default:
        return null;
    }
  }
}

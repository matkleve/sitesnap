/**
 * CapturedDateEditorComponent tests.
 *
 * Tests cover: calendar generation, day selection, month navigation,
 * smart time parsing integration, save/clear/cancel emissions,
 * click-outside behavior, and "Now" shortcut.
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import {
  CapturedDateEditorComponent,
  CalendarDay,
} from './captured-date-editor.component';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(overrides: { initialDate?: string; initialTime?: string } = {}) {
  TestBed.configureTestingModule({
    imports: [CapturedDateEditorComponent],
  });

  const fixture: ComponentFixture<CapturedDateEditorComponent> =
    TestBed.createComponent(CapturedDateEditorComponent);
  const component = fixture.componentInstance;
  const ref = fixture.componentRef as ComponentRef<CapturedDateEditorComponent>;

  if (overrides.initialDate) {
    ref.setInput('initialDate', overrides.initialDate);
  }
  if (overrides.initialTime) {
    ref.setInput('initialTime', overrides.initialTime);
  }

  fixture.detectChanges();
  return { component, fixture, ref };
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CapturedDateEditorComponent', () => {
  afterEach(() => {
    // Clean up document listeners
    TestBed.resetTestingModule();
  });

  // ── Initialization ────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('defaults to today when no initialDate provided', () => {
      const { component } = setup();
      expect(component.selectedDate()).toBe(todayStr());
    });

    it('defaults to empty time when no initialTime provided', () => {
      const { component } = setup();
      expect(component.timeInput()).toBe('');
    });

    it('sets selectedDate from initialDate input', () => {
      const { component } = setup({ initialDate: '2025-06-15' });
      expect(component.selectedDate()).toBe('2025-06-15');
    });

    it('sets timeInput from initialTime input', () => {
      const { component } = setup({ initialDate: '2025-06-15', initialTime: '10:30' });
      expect(component.timeInput()).toBe('10:30');
    });

    it('sets viewYear and viewMonth from initialDate', () => {
      const { component } = setup({ initialDate: '2025-06-15' });
      expect(component.viewYear()).toBe(2025);
      expect(component.viewMonth()).toBe(5); // 0-indexed
    });

    it('sets viewYear/viewMonth to current month when no initialDate', () => {
      const { component } = setup();
      const now = new Date();
      expect(component.viewYear()).toBe(now.getFullYear());
      expect(component.viewMonth()).toBe(now.getMonth());
    });
  });

  // ── Calendar grid ──────────────────────────────────────────────────────────

  describe('calendar grid', () => {
    it('generates 42 days (6 weeks)', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      expect(component.calendarDays().length).toBe(42);
    });

    it('starts with Monday', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      expect(component.weekdays[0]).toBe('Mo');
      expect(component.weekdays[6]).toBe('Su');
    });

    it('marks today correctly', () => {
      const { component } = setup();
      const today = component.calendarDays().find((d) => d.isToday);
      expect(today).toBeTruthy();
      expect(today!.date).toBe(todayStr());
    });

    it('marks selected date correctly', () => {
      const { component } = setup({ initialDate: '2026-03-15' });
      const selected = component.calendarDays().find((d) => d.isSelected);
      expect(selected).toBeTruthy();
      expect(selected!.date).toBe('2026-03-15');
    });

    it('includes previous month fill days', () => {
      const { component } = setup({ initialDate: '2026-03-01' });
      // March 2026 starts on Sunday, so Monday fill = 6 days from Feb
      const days = component.calendarDays();
      const prevMonthDays = days.filter((d) => !d.isCurrentMonth && d.date < '2026-03-01');
      expect(prevMonthDays.length).toBeGreaterThan(0);
    });

    it('includes next month fill days', () => {
      const { component } = setup({ initialDate: '2026-03-01' });
      const days = component.calendarDays();
      const nextMonthDays = days.filter((d) => !d.isCurrentMonth && d.date > '2026-03-31');
      expect(nextMonthDays.length).toBeGreaterThan(0);
    });

    it('current month days have isCurrentMonth=true', () => {
      const { component } = setup({ initialDate: '2026-03-01' });
      const marchDays = component.calendarDays().filter((d) => d.isCurrentMonth);
      expect(marchDays.length).toBe(31); // March has 31 days
    });
  });

  // ── Day selection ──────────────────────────────────────────────────────────

  describe('day selection', () => {
    it('selectDay updates selectedDate', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      const day: CalendarDay = {
        date: '2026-03-20',
        day: 20,
        isCurrentMonth: true,
        isToday: false,
        isSelected: false,
      };

      component.selectDay(day);

      expect(component.selectedDate()).toBe('2026-03-20');
    });

    it('selectDay navigates to other month when clicking other-month day', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      const day: CalendarDay = {
        date: '2026-04-01',
        day: 1,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
      };

      component.selectDay(day);

      expect(component.selectedDate()).toBe('2026-04-01');
      expect(component.viewMonth()).toBe(3); // April (0-indexed)
    });

    it('selected day in calendarDays reflects new selection', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.selectDay({
        date: '2026-03-25',
        day: 25,
        isCurrentMonth: true,
        isToday: false,
        isSelected: false,
      });

      const selected = component.calendarDays().filter((d) => d.isSelected);
      expect(selected.length).toBe(1);
      expect(selected[0].date).toBe('2026-03-25');
    });
  });

  // ── Month navigation ───────────────────────────────────────────────────────

  describe('month navigation', () => {
    it('nextMonth advances to next month', () => {
      const { component } = setup({ initialDate: '2026-03-10' });

      component.nextMonth();

      expect(component.viewMonth()).toBe(3); // April
      expect(component.viewYear()).toBe(2026);
    });

    it('nextMonth wraps to January of next year from December', () => {
      const { component } = setup({ initialDate: '2026-12-10' });

      component.nextMonth();

      expect(component.viewMonth()).toBe(0); // January
      expect(component.viewYear()).toBe(2027);
    });

    it('prevMonth goes to previous month', () => {
      const { component } = setup({ initialDate: '2026-03-10' });

      component.prevMonth();

      expect(component.viewMonth()).toBe(1); // February
      expect(component.viewYear()).toBe(2026);
    });

    it('prevMonth wraps to December of previous year from January', () => {
      const { component } = setup({ initialDate: '2026-01-10' });

      component.prevMonth();

      expect(component.viewMonth()).toBe(11); // December
      expect(component.viewYear()).toBe(2025);
    });
  });

  // ── setNow ─────────────────────────────────────────────────────────────────

  describe('setNow', () => {
    it('sets selectedDate to today', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setNow();

      expect(component.selectedDate()).toBe(todayStr());
    });

    it('sets timeInput to current time', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setNow();

      expect(component.timeInput()).toMatch(/^\d{2}:\d{2}$/);
    });

    it('navigates view to current month', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setNow();

      const now = new Date();
      expect(component.viewYear()).toBe(now.getFullYear());
      expect(component.viewMonth()).toBe(now.getMonth());
    });
  });

  // ── Time input ─────────────────────────────────────────────────────────────

  describe('time input', () => {
    it('onTimeBlur normalizes raw time input', () => {
      const { component } = setup();
      component.timeInput.set('900');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('09:00');
    });

    it('onTimeBlur clears invalid time', () => {
      const { component } = setup();
      component.timeInput.set('25');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('');
    });

    it('onTimeBlur leaves empty string as empty', () => {
      const { component } = setup();
      component.timeInput.set('');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('');
    });

    it('onTimeBlur normalizes "1430" to "14:30"', () => {
      const { component } = setup();
      component.timeInput.set('1430');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('14:30');
    });
  });

  // ── Save emission ──────────────────────────────────────────────────────────

  describe('save emission', () => {
    it('emitSave emits combined date+time', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });
      let emitted = '';
      component.save.subscribe((v: string) => (emitted = v));

      component.emitSave();

      expect(emitted).toBe('2026-03-10T14:30:00');
    });

    it('emitSave defaults time to 00:00 when empty', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      let emitted = '';
      component.save.subscribe((v: string) => (emitted = v));

      component.emitSave();

      expect(emitted).toBe('2026-03-10T00:00:00');
    });

    it('emitSave normalizes raw time before emitting', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.timeInput.set('930');
      let emitted = '';
      component.save.subscribe((v: string) => (emitted = v));

      component.emitSave();

      expect(emitted).toBe('2026-03-10T09:30:00');
    });

    it('emitSave does nothing when no date selected', () => {
      const { component } = setup();
      component.selectedDate.set('');
      let emitted = false;
      component.save.subscribe(() => (emitted = true));

      component.emitSave();

      expect(emitted).toBe(false);
    });
  });

  // ── Clear emission ─────────────────────────────────────────────────────────

  describe('clear emission', () => {
    it('emitClear emits clear event', () => {
      const { component } = setup();
      let emitted = false;
      component.clear.subscribe(() => (emitted = true));

      component.emitClear();

      expect(emitted).toBe(true);
    });
  });

  // ── Cancel (Escape) ────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('onKeydown Escape emits cancel', () => {
      const { component } = setup();
      let emitted = false;
      component.cancel.subscribe(() => (emitted = true));

      component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(emitted).toBe(true);
    });

    it('onKeydown other keys do not emit cancel', () => {
      const { component } = setup();
      let emitted = false;
      component.cancel.subscribe(() => (emitted = true));

      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(emitted).toBe(false);
    });
  });

  // ── Computed display values ────────────────────────────────────────────────

  describe('computed values', () => {
    it('monthLabel shows formatted month and year', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      const label = component.monthLabel();
      expect(label).toContain('2026');
      // Month name varies by locale, just check it's non-empty
      expect(label.length).toBeGreaterThan(4);
    });

    it('formattedDate shows formatted selected date', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      const formatted = component.formattedDate();
      expect(formatted).toContain('2026');
      expect(formatted).toContain('10');
    });

    it('formattedDate returns empty when no date selected', () => {
      const { component } = setup();
      component.selectedDate.set('');
      expect(component.formattedDate()).toBe('');
    });

    it('displayTime shows parsed time', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });
      expect(component.displayTime()).toBe('14:30');
    });

    it('displayTime returns empty when no time', () => {
      const { component } = setup();
      expect(component.displayTime()).toBe('');
    });
  });

  // ── Enter on time field ────────────────────────────────────────────────────

  describe('time field enter', () => {
    it('Enter key on time field normalizes and saves', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.timeInput.set('1530');
      let emitted = '';
      component.save.subscribe((v: string) => (emitted = v));

      component.onTimeKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.timeInput()).toBe('15:30');
      expect(emitted).toBe('2026-03-10T15:30:00');
    });

    it('non-Enter key does not trigger save', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      let emitted = false;
      component.save.subscribe(() => (emitted = true));

      component.onTimeKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));

      expect(emitted).toBe(false);
    });
  });
});

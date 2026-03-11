/**
 * CapturedDateEditorComponent tests.
 *
 * Tests cover: calendar generation, day selection, month navigation,
 * smart time parsing integration, save/clear/cancel emissions,
 * click-outside behavior, "Today" shortcut, date input parsing,
 * and has_time distinction (00:00 vs no time).
 */

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import {
  CapturedDateEditorComponent,
  CalendarDay,
  DateSaveEvent,
} from './captured-date-editor.component';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup(overrides: { initialDate?: string; initialTime?: string } = {}) {
  TestBed.configureTestingModule({
    imports: [CapturedDateEditorComponent],
  });

  const fixture: ComponentFixture<CapturedDateEditorComponent> = TestBed.createComponent(
    CapturedDateEditorComponent,
  );
  const component = fixture.componentInstance;
  const ref = fixture.componentRef as ComponentRef<CapturedDateEditorComponent>;

  if (overrides.initialDate) {
    ref.setInput('initialDate', overrides.initialDate);
  }
  if (overrides.initialTime !== undefined) {
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
    TestBed.resetTestingModule();
  });

  // ── Initialization ────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('defaults to empty selectedDate when no initialDate provided', () => {
      const { component } = setup();
      // No initialDate → cleared state (empty fields)
      expect(component.selectedDate()).toBe('');
    });

    it('defaults to empty time when no initialTime provided', () => {
      const { component } = setup();
      expect(component.timeInput()).toBe('');
    });

    it('sets selectedDate from initialDate input', () => {
      const { component } = setup({ initialDate: '2025-06-15' });
      expect(component.selectedDate()).toBe('2025-06-15');
    });

    it('sets dateInput in EU format from initialDate', () => {
      const { component } = setup({ initialDate: '2025-06-15' });
      expect(component.dateInput()).toBe('15.06.2025');
    });

    it('sets timeInput from initialTime input', () => {
      const { component } = setup({ initialDate: '2025-06-15', initialTime: '10:30' });
      expect(component.timeInput()).toBe('10:30');
    });

    it('sets timeInput to 00:00 when initialTime is 00:00', () => {
      const { component } = setup({ initialDate: '2025-06-15', initialTime: '00:00' });
      expect(component.timeInput()).toBe('00:00');
    });

    it('sets empty timeInput when initialTime is empty string', () => {
      const { component } = setup({ initialDate: '2025-06-15', initialTime: '' });
      expect(component.timeInput()).toBe('');
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
      // Set a date so we have a populated calendar centered on today
      component.selectedDate.set(todayStr());
      const now = new Date();
      component.viewYear.set(now.getFullYear());
      component.viewMonth.set(now.getMonth());

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
      expect(marchDays.length).toBe(31);
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

    it('selectDay updates dateInput in EU format', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.selectDay({
        date: '2026-03-20',
        day: 20,
        isCurrentMonth: true,
        isToday: false,
        isSelected: false,
      });

      expect(component.dateInput()).toBe('20.03.2026');
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

      expect(component.viewMonth()).toBe(3);
      expect(component.viewYear()).toBe(2026);
    });

    it('nextMonth wraps to January of next year from December', () => {
      const { component } = setup({ initialDate: '2026-12-10' });

      component.nextMonth();

      expect(component.viewMonth()).toBe(0);
      expect(component.viewYear()).toBe(2027);
    });

    it('prevMonth goes to previous month', () => {
      const { component } = setup({ initialDate: '2026-03-10' });

      component.prevMonth();

      expect(component.viewMonth()).toBe(1);
      expect(component.viewYear()).toBe(2026);
    });

    it('prevMonth wraps to December of previous year from January', () => {
      const { component } = setup({ initialDate: '2026-01-10' });

      component.prevMonth();

      expect(component.viewMonth()).toBe(11);
      expect(component.viewYear()).toBe(2025);
    });
  });

  // ── setToday ──────────────────────────────────────────────────────────────

  describe('setToday', () => {
    it('sets selectedDate to today', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setToday();

      expect(component.selectedDate()).toBe(todayStr());
    });

    it('does not change timeInput', () => {
      const { component } = setup({ initialDate: '2025-01-01', initialTime: '14:30' });

      component.setToday();

      expect(component.timeInput()).toBe('14:30');
    });

    it('does not set time when time was empty', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setToday();

      expect(component.timeInput()).toBe('');
    });

    it('updates dateInput to EU format', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setToday();

      const now = new Date();
      const expected = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
      expect(component.dateInput()).toBe(expected);
    });

    it('navigates view to current month', () => {
      const { component } = setup({ initialDate: '2025-01-01' });

      component.setToday();

      const now = new Date();
      expect(component.viewYear()).toBe(now.getFullYear());
      expect(component.viewMonth()).toBe(now.getMonth());
    });
  });

  // ── Date input parsing ──────────────────────────────────────────────────

  describe('date input', () => {
    it('onDateBlur parses DD.MM.YYYY and updates selectedDate', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.dateInput.set('20.07.2025');

      component.onDateBlur();

      expect(component.selectedDate()).toBe('2025-07-20');
      expect(component.dateInput()).toBe('20.07.2025');
    });

    it('onDateBlur accepts DD/MM/YYYY format', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.dateInput.set('15/06/2025');

      component.onDateBlur();

      expect(component.selectedDate()).toBe('2025-06-15');
    });

    it('onDateBlur resets to previous selection on invalid input', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.dateInput.set('invalid');

      component.onDateBlur();

      expect(component.selectedDate()).toBe('2026-03-10');
      expect(component.dateInput()).toBe('10.03.2026');
    });

    it('onDateKeydown Enter parses and saves', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.dateInput.set('15.06.2025');
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.onDateKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.selectedDate()).toBe('2025-06-15');
      expect(emitted).toBeTruthy();
      expect(emitted!.date).toBe('2025-06-15');
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

    it('onTimeBlur keeps "00:00" as "00:00"', () => {
      const { component } = setup();
      component.timeInput.set('00:00');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('00:00');
    });

    it('onTimeBlur normalizes "0" to "00:00"', () => {
      const { component } = setup();
      component.timeInput.set('0');

      component.onTimeBlur();

      expect(component.timeInput()).toBe('00:00');
    });
  });

  // ── Save emission (DateSaveEvent) ──────────────────────────────────────────

  describe('save emission', () => {
    it('emits { date, time } with date and time', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitSave();

      expect(emitted).toEqual({ date: '2026-03-10', time: '14:30' });
    });

    it('emits { date, time: null } when time is empty', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitSave();

      expect(emitted).toEqual({ date: '2026-03-10', time: null });
    });

    it('emits { date, time: "00:00" } when time is 00:00 (NOT null)', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '00:00' });
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitSave();

      expect(emitted).toEqual({ date: '2026-03-10', time: '00:00' });
    });

    it('normalizes raw time before emitting', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.timeInput.set('930');
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitSave();

      expect(emitted).toEqual({ date: '2026-03-10', time: '09:30' });
    });

    it('emits { date: null, time: null } when no date selected', () => {
      const { component } = setup();
      component.selectedDate.set('');
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitSave();

      expect(emitted).toEqual({ date: null, time: null });
    });

    it('emits { date: null, time: null } after emitClear + emitSave', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.emitClear();
      component.emitSave();

      expect(emitted).toEqual({ date: null, time: null });
    });
  });

  // ── Clear (field reset, no emit) ───────────────────────────────────────────

  describe('emitClear', () => {
    it('clears selectedDate, dateInput, and timeInput', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });

      component.emitClear();

      expect(component.selectedDate()).toBe('');
      expect(component.dateInput()).toBe('');
      expect(component.timeInput()).toBe('');
    });

    it('does not emit save event', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      let emitted = false;
      component.save.subscribe(() => (emitted = true));

      component.emitClear();

      expect(emitted).toBe(false);
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
      expect(label.length).toBeGreaterThan(4);
    });

    it('formattedDate shows DD.MM.YYYY for selected date', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      expect(component.formattedDate()).toBe('10.03.2026');
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

    it('displayTime shows 00:00 for midnight time', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '00:00' });
      expect(component.displayTime()).toBe('00:00');
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
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.onTimeKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.timeInput()).toBe('15:30');
      expect(emitted).toEqual({ date: '2026-03-10', time: '15:30' });
    });

    it('Enter with 00:00 emits time "00:00" (not null)', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      component.timeInput.set('0000');
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.onTimeKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.timeInput()).toBe('00:00');
      expect(emitted).toEqual({ date: '2026-03-10', time: '00:00' });
    });

    it('non-Enter key does not trigger save', () => {
      const { component } = setup({ initialDate: '2026-03-10' });
      let emitted = false;
      component.save.subscribe(() => (emitted = true));

      component.onTimeKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));

      expect(emitted).toBe(false);
    });
  });

  // ── Full flows (integration-style) ──────────────────────────────────────

  describe('full flows', () => {
    it('Clear + Done = null captured_at', () => {
      const { component } = setup({ initialDate: '2026-03-10', initialTime: '14:30' });
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      // User clicks Clear
      component.emitClear();
      expect(component.selectedDate()).toBe('');
      expect(component.timeInput()).toBe('');

      // User clicks Done
      component.emitSave();
      expect(emitted).toEqual({ date: null, time: null });
    });

    it('select date, no time, Done = date-only save', () => {
      const { component } = setup();
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.selectDay({
        date: '2026-07-20',
        day: 20,
        isCurrentMonth: true,
        isToday: false,
        isSelected: false,
      });
      component.emitSave();

      expect(emitted).toEqual({ date: '2026-07-20', time: null });
    });

    it('select date, type 00:00, Done = date+time with has_time', () => {
      const { component } = setup();
      let emitted: DateSaveEvent | null = null;
      component.save.subscribe((v: DateSaveEvent) => (emitted = v));

      component.selectDay({
        date: '2026-07-20',
        day: 20,
        isCurrentMonth: true,
        isToday: false,
        isSelected: false,
      });
      component.timeInput.set('00:00');
      component.emitSave();

      expect(emitted).toEqual({ date: '2026-07-20', time: '00:00' });
    });
  });
});

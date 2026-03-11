/**
 * CapturedDateEditorComponent — Notion-style inline calendar + time editor.
 *
 * Standalone component rendered inline in the image detail scroll area.
 * Features a split date/time header, month calendar grid, and smart time parsing.
 * Saves on click-outside, "Done", or Enter. Cancels on Escape.
 */

import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { parseTimeInput } from '../../../shared/parse-time-input';

export interface DateSaveEvent {
  date: string | null; // YYYY-MM-DD or null
  time: string | null; // HH:MM or null
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number; // 1–31
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-captured-date-editor',
  standalone: true,
  templateUrl: './captured-date-editor.component.html',
  styleUrl: './captured-date-editor.component.scss',
})
export class CapturedDateEditorComponent implements OnInit, OnDestroy {
  private readonly elRef = inject(ElementRef);

  // ── Inputs ─────────────────────────────────────────────────────────────────

  /** Initial date in YYYY-MM-DD format. */
  readonly initialDate = input<string>('');

  /** Initial time in HH:MM format. */
  readonly initialTime = input<string>('');

  // ── Outputs ────────────────────────────────────────────────────────────────

  /** Emitted with structured date+time when user saves. */
  readonly save = output<DateSaveEvent>();

  /** Emitted when user cancels (Escape). */
  readonly cancel = output<void>();

  // ── State ──────────────────────────────────────────────────────────────────

  readonly selectedDate = signal('');
  readonly dateInput = signal('');
  readonly timeInput = signal('');
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());

  readonly weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // ── Computed ───────────────────────────────────────────────────────────────

  readonly monthLabel = computed(() => {
    const date = new Date(this.viewYear(), this.viewMonth(), 1);
    return date.toLocaleDateString('de-AT', { month: 'short', year: 'numeric' });
  });

  readonly formattedDate = computed(() => {
    const d = this.selectedDate();
    if (!d) return '';
    const parts = d.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  });

  readonly displayTime = computed(() => {
    const t = this.timeInput();
    if (!t) return '';
    const parsed = parseTimeInput(t);
    return parsed || t;
  });

  readonly calendarDays = computed((): CalendarDay[] => {
    return this.buildCalendarDays(this.viewYear(), this.viewMonth(), this.selectedDate());
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private clickOutsideHandler = (event: MouseEvent) => {
    if (!this.elRef.nativeElement.contains(event.target as Node)) {
      this.emitSave();
    }
  };

  constructor() {
    effect(() => {
      const date = this.initialDate();
      const time = this.initialTime();
      if (date) {
        this.selectedDate.set(date);
        this.dateInput.set(this.formatEU(date));
        const parts = date.split('-');
        this.viewYear.set(parseInt(parts[0]));
        this.viewMonth.set(parseInt(parts[1]) - 1);
      } else {
        // No date — keep fields empty (cleared state)
        this.selectedDate.set('');
        this.dateInput.set('');
      }
      this.timeInput.set(time || '');
    });
  }

  ngOnInit(): void {
    // Defer to next tick so the initial click that opens the editor doesn't immediately close it
    setTimeout(() => {
      document.addEventListener('mousedown', this.clickOutsideHandler);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.clickOutsideHandler);
  }

  // ── Calendar grid builder ──────────────────────────────────────────────────

  private buildCalendarDays(year: number, month: number, selected: string): CalendarDay[] {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1);
    // Monday-start: 0=Mon, 6=Sun
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: CalendarDay[] = [];

    // Previous month fill
    for (let i = startDow - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selected,
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selected,
      });
    }

    // Next month fill to complete 6 rows (42 cells)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selected,
      });
    }

    return days;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  selectDay(day: CalendarDay): void {
    this.selectedDate.set(day.date);
    this.dateInput.set(this.formatEU(day.date));
    // If clicking a day from another month, navigate to it
    if (!day.isCurrentMonth) {
      const parts = day.date.split('-');
      this.viewYear.set(parseInt(parts[0]));
      this.viewMonth.set(parseInt(parts[1]) - 1);
    }
  }

  prevMonth(): void {
    if (this.viewMonth() === 0) {
      this.viewYear.update((y) => y - 1);
      this.viewMonth.set(11);
    } else {
      this.viewMonth.update((m) => m - 1);
    }
  }

  nextMonth(): void {
    if (this.viewMonth() === 11) {
      this.viewYear.update((y) => y + 1);
      this.viewMonth.set(0);
    } else {
      this.viewMonth.update((m) => m + 1);
    }
  }

  setToday(): void {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = now.getMonth();
    const dd = now.getDate();
    const iso = `${yyyy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    this.selectedDate.set(iso);
    this.dateInput.set(this.formatEU(iso));
    this.viewYear.set(yyyy);
    this.viewMonth.set(mm);
  }

  onDateBlur(): void {
    const parsed = this.parseDateInput(this.dateInput());
    if (parsed) {
      this.selectedDate.set(parsed);
      this.dateInput.set(this.formatEU(parsed));
      const parts = parsed.split('-');
      this.viewYear.set(parseInt(parts[0]));
      this.viewMonth.set(parseInt(parts[1]) - 1);
    } else {
      // Reset to current selection
      this.dateInput.set(this.formatEU(this.selectedDate()));
    }
  }

  onDateKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onDateBlur();
      this.emitSave();
    }
  }

  onTimeBlur(): void {
    const parsed = parseTimeInput(this.timeInput());
    this.timeInput.set(parsed);
  }

  onTimeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onTimeBlur();
      this.emitSave();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancel.emit();
    }
  }

  emitSave(): void {
    const date = this.selectedDate() || null;
    const time = parseTimeInput(this.timeInput()) || null;
    this.save.emit({ date, time });
  }

  emitClear(): void {
    this.selectedDate.set('');
    this.dateInput.set('');
    this.timeInput.set('');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private formatEU(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  /**
   * Flexible date parser for Middle European formats.
   * Accepts: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, D.M.YY, D.M, "11 Mar 2026", etc.
   * Returns YYYY-MM-DD or empty string if unparseable.
   */
  private parseDateInput(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    // Try DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY (with optional 2-digit year)
    const sepMatch = trimmed.match(/^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2,4}))?$/);
    if (sepMatch) {
      const day = parseInt(sepMatch[1], 10);
      const month = parseInt(sepMatch[2], 10);
      let year = sepMatch[3] ? parseInt(sepMatch[3], 10) : new Date().getFullYear();
      if (year < 100) year += 2000;
      if (month < 1 || month > 12 || day < 1 || day > 31) return '';
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Try native Date.parse as fallback (handles "11 Mar 2026", "March 11, 2026", etc.)
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    return '';
  }
}

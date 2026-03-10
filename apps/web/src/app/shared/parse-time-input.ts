/**
 * Smart time parser for 24h format.
 *
 * Accepts flexible input and normalizes to "HH:MM" or empty string.
 * Examples: "9" → "09:00", "900" → "09:00", "1430" → "14:30", "14:30" → "14:30"
 */
export function parseTimeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Already formatted: "H:MM" or "HH:MM"
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    return formatHM(parseInt(colonMatch[1], 10), parseInt(colonMatch[2], 10));
  }

  // Pure digits only
  if (!/^\d{1,4}$/.test(trimmed)) return '';

  return parseDigits(trimmed);
}

function formatHM(h: number, m: number): string {
  if (h > 23 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseDigits(digits: string): string {
  switch (digits.length) {
    case 1:
    case 2:
      return formatHM(parseInt(digits, 10), 0);
    case 3:
      return formatHM(parseInt(digits[0], 10), parseInt(digits.slice(1), 10));
    case 4:
      return formatHM(parseInt(digits.slice(0, 2), 10), parseInt(digits.slice(2), 10));
    default:
      return '';
  }
}

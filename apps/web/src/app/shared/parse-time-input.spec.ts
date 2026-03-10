import { parseTimeInput } from './parse-time-input';

describe('parseTimeInput', () => {
  // ── Empty / whitespace ──
  it('returns empty for empty string', () => {
    expect(parseTimeInput('')).toBe('');
  });

  it('returns empty for whitespace only', () => {
    expect(parseTimeInput('   ')).toBe('');
  });

  // ── Single digit ──
  it('parses "0" → "00:00"', () => {
    expect(parseTimeInput('0')).toBe('00:00');
  });

  it('parses "9" → "09:00"', () => {
    expect(parseTimeInput('9')).toBe('09:00');
  });

  it('parses "1" → "01:00"', () => {
    expect(parseTimeInput('1')).toBe('01:00');
  });

  // ── Two digits ──
  it('parses "14" → "14:00"', () => {
    expect(parseTimeInput('14')).toBe('14:00');
  });

  it('parses "23" → "23:00"', () => {
    expect(parseTimeInput('23')).toBe('23:00');
  });

  it('parses "00" → "00:00"', () => {
    expect(parseTimeInput('00')).toBe('00:00');
  });

  it('returns empty for "24" (invalid hour)', () => {
    expect(parseTimeInput('24')).toBe('');
  });

  it('returns empty for "25" (invalid hour)', () => {
    expect(parseTimeInput('25')).toBe('');
  });

  it('returns empty for "99" (invalid hour)', () => {
    expect(parseTimeInput('99')).toBe('');
  });

  // ── Three digits ──
  it('parses "900" → "09:00"', () => {
    expect(parseTimeInput('900')).toBe('09:00');
  });

  it('parses "930" → "09:30"', () => {
    expect(parseTimeInput('930')).toBe('09:30');
  });

  it('parses "130" → "01:30"', () => {
    expect(parseTimeInput('130')).toBe('01:30');
  });

  it('parses "000" → "00:00"', () => {
    expect(parseTimeInput('000')).toBe('00:00');
  });

  it('returns empty for "999" (invalid: 9h 99m)', () => {
    expect(parseTimeInput('999')).toBe('');
  });

  // ── Four digits ──
  it('parses "0900" → "09:00"', () => {
    expect(parseTimeInput('0900')).toBe('09:00');
  });

  it('parses "1430" → "14:30"', () => {
    expect(parseTimeInput('1430')).toBe('14:30');
  });

  it('parses "2359" → "23:59"', () => {
    expect(parseTimeInput('2359')).toBe('23:59');
  });

  it('parses "0000" → "00:00"', () => {
    expect(parseTimeInput('0000')).toBe('00:00');
  });

  it('returns empty for "2500" (invalid hour)', () => {
    expect(parseTimeInput('2500')).toBe('');
  });

  it('returns empty for "1299" (invalid minutes)', () => {
    expect(parseTimeInput('1299')).toBe('');
  });

  it('returns empty for "2460" (invalid both)', () => {
    expect(parseTimeInput('2460')).toBe('');
  });

  // ── Colon-formatted ──
  it('parses "9:00" → "09:00"', () => {
    expect(parseTimeInput('9:00')).toBe('09:00');
  });

  it('parses "14:30" → "14:30" (passthrough)', () => {
    expect(parseTimeInput('14:30')).toBe('14:30');
  });

  it('parses "0:00" → "00:00"', () => {
    expect(parseTimeInput('0:00')).toBe('00:00');
  });

  it('parses "23:59" → "23:59"', () => {
    expect(parseTimeInput('23:59')).toBe('23:59');
  });

  it('returns empty for "25:00" (invalid hour)', () => {
    expect(parseTimeInput('25:00')).toBe('');
  });

  it('returns empty for "9:99" (invalid minutes)', () => {
    expect(parseTimeInput('9:99')).toBe('');
  });

  it('returns empty for "24:00" (invalid hour)', () => {
    expect(parseTimeInput('24:00')).toBe('');
  });

  // ── Non-numeric / invalid ──
  it('returns empty for "abc"', () => {
    expect(parseTimeInput('abc')).toBe('');
  });

  it('returns empty for "12:ab"', () => {
    expect(parseTimeInput('12:ab')).toBe('');
  });

  it('returns empty for "12345" (too many digits)', () => {
    expect(parseTimeInput('12345')).toBe('');
  });

  // ── Whitespace handling ──
  it('trims whitespace before parsing "  9  "', () => {
    expect(parseTimeInput('  9  ')).toBe('09:00');
  });

  it('trims whitespace before parsing " 14:30 "', () => {
    expect(parseTimeInput(' 14:30 ')).toBe('14:30');
  });
});

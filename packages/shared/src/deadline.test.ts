import { describe, expect, it } from 'vitest';
import { austrianHolidays, computeDeadline, DeadlineRangeError, easterSunday, timeLeft, viennaDate, zonedEndOfDay } from './deadline.js';

describe('Austrian public holidays (Arbeitsruhegesetz section 7(2))', () => {
  // Fixed table, written out by hand from a calendar, so the Easter computation is checked independently.
  const expected: Record<number, string[]> = {
    2026: ['2026-01-01', '2026-01-06', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-06-04', '2026-08-15', '2026-10-26', '2026-11-01', '2026-12-08', '2026-12-25', '2026-12-26'],
    2027: ['2027-01-01', '2027-01-06', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-05-27', '2027-08-15', '2027-10-26', '2027-11-01', '2027-12-08', '2027-12-25', '2027-12-26'],
  };
  it.each([2026, 2027])('matches the fixed table for %i', (year) => {
    expect([...austrianHolidays(year).keys()].sort()).toEqual(expected[year]);
  });
  it('computes Easter Sunday', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  it('refuses years without a configured calendar', () => {
    expect(() => austrianHolidays(2028)).toThrow(DeadlineRangeError);
    expect(() => computeDeadline('2027-12-20', 15)).toThrow(DeadlineRangeError);
  });
});

describe('computeDeadline', () => {
  it('counts calendar days from the day after awareness', () => {
    const d = computeDeadline('2026-03-02', 15); // Mon, day 15 is Tue 17 Mar
    expect(d.legalLastDay).toBe('2026-03-17');
    expect(d.dueDate).toBe('2026-03-17');
    expect(d.days).toHaveLength(16);
    expect(d.days.some((x) => x.extension)).toBe(false);
  });

  it('moves a last day on a weekend to the next working day', () => {
    const d = computeDeadline('2026-03-04', 10); // day 10 is Sat 14 Mar
    expect(d.dueDate).toBe('2026-03-16');
    expect(d.days.filter((x) => x.extension).map((x) => x.date)).toEqual(['2026-03-15', '2026-03-16']);
  });

  it('moves past a weekend followed by a public holiday', () => {
    const d = computeDeadline('2026-10-15', 10); // Sun 25 Oct, Mon 26 Oct National Day
    expect(d.dueDate).toBe('2026-10-27');
  });

  it('keeps two working days in a 2-day period (Regulation 1182/71 Art. 3(5))', () => {
    // Fri 23 Oct: day 2 is Sun 25, Mon 26 is National Day, Tue 27 is the only working day so far.
    const d = computeDeadline('2026-10-23', 2);
    expect(d.dueDate).toBe('2026-10-28');
    expect(d.explanation.join(' ')).toMatch(/two working days/);
  });

  it('does not extend a 2-day period that already has two working days', () => {
    expect(computeDeadline('2026-10-19', 2).dueDate).toBe('2026-10-21');
  });

  it('counts the same day numbers as the MDCG 2023-3 Q14 example (1 July + 15, 2 July + 10)', () => {
    expect(computeDeadline('2026-07-01', 15).legalLastDay).toBe('2026-07-16');
    expect(computeDeadline('2026-07-02', 10).legalLastDay).toBe('2026-07-12');
  });

  it('ends at 23:59:59 Vienna time in winter and summer', () => {
    expect(zonedEndOfDay('2026-01-15')).toBe('2026-01-15T22:59:59.000Z');
    expect(zonedEndOfDay('2026-07-15')).toBe('2026-07-15T21:59:59.000Z');
    // Last Sunday of October 2026 is the 25th: clocks go back at 03:00.
    expect(zonedEndOfDay('2026-10-25')).toBe('2026-10-25T22:59:59.000Z');
    expect(zonedEndOfDay('2026-03-29')).toBe('2026-03-29T21:59:59.000Z');
  });

  it('is still open one second before the deadline and overdue one second after', () => {
    const d = computeDeadline('2026-10-23', 2);
    expect(d.dueAt).toBe('2026-10-28T22:59:59.000Z');
    expect(timeLeft(d.dueAt, '2026-10-28T22:59:58.000Z').overdue).toBe(false);
    expect(timeLeft(d.dueAt, '2026-10-28T22:59:59.000Z').overdue).toBe(false);
    expect(timeLeft(d.dueAt, '2026-10-28T23:00:00.000Z').overdue).toBe(true);
  });

  it('gives the Vienna calendar date of an instant', () => {
    // Summer time (UTC+2) until 25 Oct 2026, winter time (UTC+1) after.
    expect(viennaDate('2026-10-23T21:59:00Z')).toBe('2026-10-23');
    expect(viennaDate('2026-10-23T22:30:00Z')).toBe('2026-10-24');
    expect(viennaDate('2026-10-26T22:30:00Z')).toBe('2026-10-26');
    expect(viennaDate('2026-10-26T23:30:00Z')).toBe('2026-10-27');
  });
});

describe('deadline wording', () => {
  it('abbreviates September as Sep, like every other month', () => {
    const text = computeDeadline('2026-09-14', 15).explanation.join(' ');
    expect(text).toContain('Mon 14 Sep');
    expect(text).not.toContain('Sept');
  });
});

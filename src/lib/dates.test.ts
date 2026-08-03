import { describe, expect, it } from 'vitest';
import { getCountdown, getRelationshipDuration, getNextAnnualOccurrence, getDateInTimezone } from './dates';

describe('date calculations', () => {
  it('calculates a recurring anniversary in the current year', () => {
    expect(getNextAnnualOccurrence('2022-08-14', new Date('2026-07-31T12:00:00Z')))
      .toBe('2026-08-14');
  });

  it('moves a recurring anniversary to next year after it passes', () => {
    expect(getNextAnnualOccurrence('2022-06-14', new Date('2026-07-31T12:00:00Z')))
      .toBe('2027-06-14');
  });

  it('returns a human-readable countdown for a future date', () => {
    expect(getCountdown('2026-08-14', new Date('2026-07-31T12:00:00Z')))
      .toEqual({ days: 14, label: '还有 14 天' });
  });

  it('calculates relationship duration without depending on local time', () => {
    expect(getRelationshipDuration('2024-02-29', new Date('2026-07-31T12:00:00Z')))
      .toEqual({ years: 2, months: 5, days: 2, totalDays: 883 });
  });

  it('returns no duration when the relationship start date is not set', () => {
    expect(getRelationshipDuration(null, new Date('2026-07-31T12:00:00Z'))).toBeUndefined();
  });

  it('uses the space timezone when deriving today from an instant', () => {
    expect(getDateInTimezone(new Date('2026-08-02T16:30:00Z'), 'Asia/Hong_Kong')).toBe('2026-08-03');
  });

  it('uses the Hong Kong calendar date for countdowns across UTC midnight', () => {
    const instant = new Date('2026-08-02T16:30:00Z');
    expect(getCountdown('2026-08-03', instant)).toMatchObject({ days: 0, label: '就是今天' });
    expect(getNextAnnualOccurrence('2022-08-03', instant)).toBe('2026-08-03');
    expect(getRelationshipDuration('2026-08-03', instant)).toMatchObject({ years: 0, months: 0, days: 0, totalDays: 0 });
  });
});

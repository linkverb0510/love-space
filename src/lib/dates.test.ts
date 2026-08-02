import { describe, expect, it } from 'vitest';
import { getCountdown, getRelationshipDuration, getNextAnnualOccurrence } from './dates';

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
});

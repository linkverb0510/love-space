import { describe, expect, it } from 'vitest';
import { canEditSpace, readRelationshipStart } from './editing';

describe('space editing readiness', () => {
  it('blocks edits while a remote space is still loading', () => {
    expect(canEditSpace(true, false)).toBe(false);
  });

  it('allows edits for ready remote data and local data', () => {
    expect(canEditSpace(true, true)).toBe(true);
    expect(canEditSpace(false, false)).toBe(true);
  });

  it('reads the submitted date from the form payload', () => {
    const formData = new FormData();
    formData.set('relationship-start', '2025-01-01');

    expect(readRelationshipStart(formData)).toBe('2025-01-01');
  });
});

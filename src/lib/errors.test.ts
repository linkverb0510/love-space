import { describe, expect, it } from 'vitest';
import { ConflictError } from './errors';

describe('repository errors', () => {
  it('identifies optimistic concurrency conflicts', () => {
    const error = new ConflictError('timeline-1');

    expect(error.name).toBe('ConflictError');
    expect(error.entityId).toBe('timeline-1');
    expect(error.message).toContain('timeline-1');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveRole, getRoleLabel, normalizeAssignee, normalizeRole, saveActiveRole } from './roles';

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

describe('space roles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes stable and legacy role values without guessing missing authors', () => {
    expect(normalizeRole('l')).toBe('l');
    expect(normalizeRole('W')).toBe('w');
    expect(normalizeRole('一起')).toBe('both');
    expect(normalizeRole('我')).toBe('l');
    expect(normalizeRole('你')).toBe('w');
    expect(normalizeRole(undefined)).toBe('unknown');
    expect(normalizeRole('someone-else')).toBe('unknown');
  });

  it('keeps plan assignee compatibility while exposing stable role values', () => {
    expect(normalizeAssignee('我')).toBe('l');
    expect(normalizeAssignee('你')).toBe('w');
    expect(normalizeAssignee('一起')).toBe('both');
    expect(normalizeAssignee('unknown')).toBe('both');
    expect(getRoleLabel('l')).toBe('L');
    expect(getRoleLabel('w')).toBe('W');
    expect(getRoleLabel('both')).toBe('一起');
    expect(getRoleLabel('unknown')).toBe('未标记');
  });

  it('stores the active role per space and defaults to L', () => {
    vi.stubGlobal('window', { localStorage: createLocalStorage() });

    expect(getActiveRole('local-development')).toBe('l');
    saveActiveRole('local-development', 'w');
    expect(getActiveRole('local-development')).toBe('w');
    expect(getActiveRole('another-space')).toBe('l');
  });
});

import { describe, expect, it } from 'vitest';
import { getServiceWorkerUrl, isPrivateSpaceEntry } from './runtime-path';

describe('getServiceWorkerUrl', () => {
  it('resolves the worker below the configured project base path', () => {
    expect(getServiceWorkerUrl('/love-space/', 'https://example.test')).toBe('https://example.test/love-space/sw.js');
  });

  it('resolves the worker at the host root when no project base is configured', () => {
    expect(getServiceWorkerUrl('/', 'https://example.test')).toBe('https://example.test/sw.js');
  });

  it('selects the private entry only when the explicit query flag is present', () => {
    expect(isPrivateSpaceEntry('?space=private')).toBe(true);
    expect(isPrivateSpaceEntry('')).toBe(false);
    expect(isPrivateSpaceEntry('?space=public')).toBe(false);
  });
});

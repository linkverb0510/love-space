import { describe, expect, it } from 'vitest';
import { shouldCacheRequest } from './cache-policy';

describe('service worker cache policy', () => {
  it('does not cache Supabase APIs, auth, storage, or images', () => {
    expect(shouldCacheRequest('https://example.supabase.co/rest/v1/spaces', 'https://love.example.com', '')).toBe(false);
    expect(shouldCacheRequest('https://example.supabase.co/auth/v1/token', 'https://love.example.com', '')).toBe(false);
    expect(shouldCacheRequest('https://love.example.com/storage/v1/object/sign/path', 'https://love.example.com', '')).toBe(false);
    expect(shouldCacheRequest('https://love.example.com/assets/photo.webp', 'https://love.example.com', 'image')).toBe(false);
  });

  it('caches same-origin app shell requests', () => {
    expect(shouldCacheRequest('https://love.example.com/love-space/assets/index.js', 'https://love.example.com', 'script')).toBe(true);
  });
});

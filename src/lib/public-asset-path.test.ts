import { describe, expect, it } from 'vitest';
import { getPublicAssetPath } from './public-asset-path';

describe('getPublicAssetPath', () => {
  it('keeps local-development asset paths rooted at slash', () => {
    expect(getPublicAssetPath('assets/stickers/strawberry.svg', '/')).toBe('/assets/stickers/strawberry.svg');
  });

  it('prefixes project-site asset paths with the configured base', () => {
    expect(getPublicAssetPath('assets/stickers/strawberry.svg', '/love-space/')).toBe('/love-space/assets/stickers/strawberry.svg');
  });
});

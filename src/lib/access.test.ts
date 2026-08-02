import { describe, expect, it } from 'vitest';
import { hashAccessPassword, verifyAccessPassword } from './access';

describe('fixed space password', () => {
  it('accepts only the password used to create the configured hash', async () => {
    const passwordHash = await hashAccessPassword('rose-garden-2026');

    await expect(verifyAccessPassword('rose-garden-2026', passwordHash)).resolves.toBe(true);
    await expect(verifyAccessPassword('rose-garden-2027', passwordHash)).resolves.toBe(false);
  });

  it('rejects access when no password hash is configured', async () => {
    await expect(verifyAccessPassword('anything', '')).resolves.toBe(false);
  });
});

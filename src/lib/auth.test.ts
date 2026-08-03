import { describe, expect, it } from 'vitest';
import { signInWithSharedPassword } from './auth';

describe('shared Supabase Auth login', () => {
  it('uses the configured email while exposing only password to the caller', async () => {
    let received: { email: string; password: string } | undefined;
    const session = { access_token: 'token' };
    const client = {
      auth: {
        signInWithPassword: async (credentials: { email: string; password: string }) => {
          received = credentials;
          return { data: { session }, error: null };
        }
      }
    };

    await expect(signInWithSharedPassword(client as never, 'shared@example.com', 'secret')).resolves.toBe(session);
    expect(received).toEqual({ email: 'shared@example.com', password: 'secret' });
  });

  it('rejects a missing configured email before calling Supabase', async () => {
    const client = { auth: { signInWithPassword: async () => ({ data: { session: null }, error: null }) } };

    await expect(signInWithSharedPassword(client as never, '', 'secret')).rejects.toThrow('共享账号邮箱尚未配置');
  });
});

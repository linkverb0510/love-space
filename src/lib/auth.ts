import type { Session, SupabaseClient } from '@supabase/supabase-js';

type AuthClient = Pick<SupabaseClient, 'auth'>;

export async function signInWithSharedPassword(client: AuthClient, email: string, password: string): Promise<Session> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('共享账号邮箱尚未配置。');
  if (!password) throw new Error('请输入共同密码。');

  const result = await client.auth.signInWithPassword({ email: normalizedEmail, password });
  if (result.error) throw new Error(result.error.message);
  if (!result.data.session) throw new Error('登录没有返回有效会话，请稍后重试。');
  return result.data.session;
}

export async function restoreAuthSession(client: AuthClient): Promise<Session | null> {
  const result = await client.auth.getSession();
  if (result.error) throw new Error(result.error.message);
  return result.data.session;
}

export async function signOut(client: AuthClient): Promise<void> {
  const result = await client.auth.signOut();
  if (result.error) throw new Error(result.error.message);
}

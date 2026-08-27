import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 真人头像私有通道:头像存于私有桶 {spaceId}/avatars/{l,w}.png,
 * 登录后按需创建短时签名 URL;公开模式永不调用。
 */
const AVATARS_BUCKET = 'love-space-photos';
const SIGNED_URL_TTL_SECONDS = 3600;

export type AvatarUrls = { l?: string; w?: string };

export async function fetchAvatarUrls(client: SupabaseClient, spaceId: string): Promise<AvatarUrls> {
  const [l, w] = await Promise.all([
    client.storage.from(AVATARS_BUCKET).createSignedUrl(`${spaceId}/avatars/l.png`, SIGNED_URL_TTL_SECONDS),
    client.storage.from(AVATARS_BUCKET).createSignedUrl(`${spaceId}/avatars/w.png`, SIGNED_URL_TTL_SECONDS)
  ]);
  return {
    l: l.data?.signedUrl ?? undefined,
    w: w.data?.signedUrl ?? undefined
  };
}

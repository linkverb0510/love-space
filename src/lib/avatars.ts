import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 真人头像私有通道:头像存于私有桶 {spaceId}/avatars/{l,w}.png。
 * 路径首段必须是空间 UUID(存储 RLS 的 storage_space_id 只认 UUID),
 * 因此这里先用 slug 解析空间 ID,再按需创建短时签名 URL;公开模式永不调用。
 */
const AVATARS_BUCKET = 'love-space-photos';
const SIGNED_URL_TTL_SECONDS = 3600;

export type AvatarUrls = { l?: string; w?: string };

export async function resolveSpaceId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await client.from('spaces').select('id').eq('slug', slug).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? `未找到空间 ${slug}`);
  return data.id as string;
}

export async function fetchAvatarUrls(client: SupabaseClient, slug: string): Promise<AvatarUrls> {
  const spaceId = await resolveSpaceId(client, slug);
  const [l, w] = await Promise.all([
    client.storage.from(AVATARS_BUCKET).createSignedUrl(`${spaceId}/avatars/l.png`, SIGNED_URL_TTL_SECONDS),
    client.storage.from(AVATARS_BUCKET).createSignedUrl(`${spaceId}/avatars/w.png`, SIGNED_URL_TTL_SECONDS)
  ]);
  return {
    l: l.data?.signedUrl ?? undefined,
    w: w.data?.signedUrl ?? undefined
  };
}

// 一次性上传双人头像到 Supabase 私有桶:{spaceId}/avatars/{l,w}.png
// 路径首段必须是空间 UUID(存储 RLS 的 storage_space_id 只认 UUID),
// 因此脚本先登录,再用 slug 解析出空间 UUID。
// 用法:
//   node --env-file=.env.local scripts/upload-avatars.mjs <L头像图片> <W头像图片>
// (.env.local 需含 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY /
//  VITE_SHARED_AUTH_EMAIL / VITE_PRIVATE_SPACE_PATH / AVATAR_SHARED_PASSWORD;
//  密码只经环境变量进入内存,不会被写入任何文件。)
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const [lFile, wFile] = process.argv.slice(2);
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SHARED_AUTH_EMAIL, VITE_PRIVATE_SPACE_PATH, AVATAR_SHARED_PASSWORD } = process.env;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!lFile || !wFile) fail('请传入两张头像文件:node scripts/upload-avatars.mjs <L头像> <W头像>');
for (const [name, value] of [['VITE_SUPABASE_URL', VITE_SUPABASE_URL], ['VITE_SUPABASE_ANON_KEY', VITE_SUPABASE_ANON_KEY], ['VITE_SHARED_AUTH_EMAIL', VITE_SHARED_AUTH_EMAIL], ['VITE_PRIVATE_SPACE_PATH', VITE_PRIVATE_SPACE_PATH], ['AVATAR_SHARED_PASSWORD', AVATAR_SHARED_PASSWORD]]) {
  if (!value) fail(`缺少环境变量 ${name}(在 .env.local 中补齐)`);
}

const extension = (file) => (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png');

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

console.log('正在登录共享账号…');
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: VITE_SHARED_AUTH_EMAIL,
  password: AVATAR_SHARED_PASSWORD
});
if (authError || !auth.session) fail(`登录失败:${authError?.message ?? '未获得会话'}`);

console.log(`正在解析空间 ${VITE_PRIVATE_SPACE_PATH} 的 UUID…`);
const { data: space, error: spaceError } = await supabase
  .from('spaces')
  .select('id')
  .eq('slug', VITE_PRIVATE_SPACE_PATH)
  .maybeSingle();
if (spaceError || !space) fail(`解析空间失败:${spaceError?.message ?? `未找到 slug 为 ${VITE_PRIVATE_SPACE_PATH} 的空间`}`);
const spaceId = space.id;
console.log(`✓ 空间 UUID:${spaceId}`);

for (const [role, file] of [['l', lFile], ['w', wFile]]) {
  const bytes = await readFile(file);
  const contentType = `image/${extension(file)}`;
  const target = `${spaceId}/avatars/${role}.png`;
  const { error } = await supabase.storage
    .from('love-space-photos')
    .upload(target, bytes, { contentType, upsert: true });
  if (error) fail(`上传 ${target} 失败:${error.message}`);
  console.log(`✓ 已上传 ${target}(${Math.round(bytes.length / 1024)} KB)`);
}
console.log('完成。打开私密空间刷新页面即可看到头像。');

# Our Little Space

一个只属于两个人的回忆空间。当前版本包含首页、B1 相册页轴、照片、计划和设置，并将公开展示入口与私密共享入口分开。

## 运行入口

- 公开预览：`https://linkverb0510.github.io/love-space/`
  - 空数据、只读、不连接 Supabase。
  - 用于展示 UI，不要上传真实照片。
- 私密共享：`https://linkverb0510.github.io/love-space/?space=private`
  - 使用 Supabase Auth、RLS 和 private Storage。
  - 两个人输入同一个共享密码，密码由 Supabase 服务端验证。

## 功能

- 普通回忆和重要日子共用 B1 相册页轴。
- 空开始日期不会生成关系起点节点，也不会计算恋爱时长。
- 图片上传前限制为图片类型和 20MB，最长边压缩到 2048px WebP。
- 本地模式使用 localStorage 保存元数据、IndexedDB 保存图片 Blob。
- Supabase 模式使用实体级版本写入，旧版本保存会提示冲突，不会覆盖另一台设备的数据。
- `prefers-reduced-motion` 下关闭非必要动效；弹层支持 Escape、初始焦点和焦点循环。

## 本地开发

```bash
npm install
npm run dev
```

默认 `.env` 不需要 Supabase：

```text
VITE_DATA_MODE=local
VITE_PUBLIC_DEMO=false
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PRIVATE_SPACE_PATH=private-space
VITE_SHARED_AUTH_EMAIL=
```

本地模式的数据只属于当前浏览器。正式共享空间必须使用 Supabase 模式，不要把真实照片放入本地模式后期待跨设备同步。

## Supabase 初始化

1. 在 Supabase Authentication -> Users 中创建专用共享账号，启用自动确认邮箱，并设置共同密码。明文密码不要发给 Codex、不要提交到 Git。
2. 在 SQL Editor 中先执行 `supabase/migrations/0001_initial.sql`，再备份公开空间后执行 `supabase/migrations/0002_private_space.sql`。
3. 在 SQL Editor 中查询私密空间 ID，并将共享账号加入成员表。`auth.users` 中的用户 UUID 可在 Authentication -> Users 查看：

```sql
insert into public.space_members (space_id, user_id, role)
select id, '替换为共享账号的 auth.users.id'::uuid, 'owner'
from public.spaces
where slug = 'private-space'
on conflict (space_id, user_id) do nothing;
```

4. 如果公开空间中有需要保留的内容，先完成数量校验和复制，再清除公开空间内容。迁移脚本不会自动替你复制或删除业务数据。
5. 不要使用 `service_role` key。前端只配置 publishable/anon key，安全边界由 Auth、RLS 和 private Storage 提供。

共享账号方案暂时不能区分是哪个人做了修改，也不能单独撤销其中一人的访问；未来可以把它升级为两个 Auth 账号和两个 `space_members` 成员。

## GitHub Pages 部署

仓库工作流 `.github/workflows/deploy-pages.yml` 会在 `main` 更新后构建并发布到：

```text
https://linkverb0510.github.io/love-space/
```

在仓库 Settings -> Secrets and variables -> Actions 中配置：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_PRIVATE_SPACE_PATH
VITE_SHARED_AUTH_EMAIL
```

缺少 Supabase Secrets 时，公开根入口仍能展示空 UI，但私密入口会明确显示配置错误，不会静默伪装成“共享成功”。

## 验证

```bash
npm test
npm run build
```

Service Worker 只缓存同源应用壳，不缓存 Supabase API、Auth、Storage 或照片 URL。

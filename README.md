# Our Little Space

一个只属于两个人的回忆空间。当前版本包含首页、B1 相册页轴、照片、计划和设置，并将公开展示入口与私密共享入口分开。

## 运行入口

- 公开预览：`https://linkverb0510.github.io/love-space/`
  - 空数据、只读、不连接 Supabase。
  - 用于展示 UI，不要上传真实照片。
- 本地开发：`http://127.0.0.1:5173/`
  - Vite 开发服务器默认开启本地编辑，数据只保存在当前浏览器的 localStorage 和 IndexedDB。
  - 可直接试验回忆、照片、动态照片、计划和设置；不会写入 Supabase。
- 私密共享：`https://linkverb0510.github.io/love-space/?space=private`
  - 使用 Supabase Auth、RLS 和 private Storage。
  - 两个人输入同一个共享密码，密码由 Supabase 服务端验证。

## 功能

- 普通回忆和重要日子共用 B1 相册页轴。
- 空开始日期不会生成关系起点节点，也不会计算恋爱时长。
- 图片上传保留原文件、MIME、大小和尺寸；同时生成 720px 缩略图与 2048px 展示版，单个媒体仍限制为 20MB。
- 支持同名图片与 MOV/MP4 配对为网页动态照片：照片墙显示静态封面，详情页按需播放视频；无法预览的 HEIC 仍可下载原图。
- 新上传照片的日期优先读取 EXIF 拍摄时间，其次识别文件名日期，再退回文件修改时间和业务备用日期；照片仍可在详情中手动修正。
- 时间线新增回忆时可以同时选择多张照片，回忆保存后照片自动关联该条时间线，并同步出现在照片墙。
- L/W 是内容添加者标记，不是权限角色；设置页可切换当前身份，新建回忆、照片和计划会默认继承该身份，历史未标记内容显示为“未标记”。
- 本地模式使用 localStorage 保存元数据、IndexedDB 事务性保存原图、缩略图、展示图和动态片段 Blob。
- Supabase 模式使用实体级版本写入，旧版本保存会提示冲突，不会覆盖另一台设备的数据。
- `prefers-reduced-motion` 下关闭非必要动效；弹层支持 Escape、初始焦点和焦点循环。
- Atelier 视觉层使用上下双层扇形蕾丝、可辨认的玫瑰花瓣/花心/叶片插画和 L/W 色夹带；装饰只在背景和纸卡边缘出现，真实照片保持主位，缎带摆动在 reduced-motion 下自动关闭。

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

本地开发根入口会根据 `import.meta.env.DEV` 自动开启编辑；生产构建根入口仍是只读公开预览。需要测试线上共享流程时，使用 `?space=private` 并通过 Supabase Auth 登录。

## Supabase 初始化

1. 在 Supabase Authentication -> Users 中创建专用共享账号，启用自动确认邮箱，并设置共同密码。明文密码不要发给 Codex、不要提交到 Git。
2. 在 SQL Editor 中先执行 `supabase/migrations/0001_initial.sql`，再备份公开空间后执行 `supabase/migrations/0002_private_space.sql`、`supabase/migrations/0003_photo_assets.sql` 和 `supabase/migrations/0004_roles.sql`。角色迁移只增加可为空的作者标记，不改变 `space_members` 的权限模型。
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

`0003_photo_assets.sql` 会把历史 `storage_path` 作为展示资源继续读取，不会伪造无法恢复的原图；新增媒体的原图和动态片段只在查看、下载或播放时签发临时 URL。
`0004_roles.sql` 会为回忆、照片和计划增加 `created_by_role`。线上迁移前先备份私密空间；历史空值继续显示为“未标记”，不会被自动归属给 L 或 W。
历史照片没有原始拍摄元数据时不会被自动猜测，仍以已有日期为准。

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
npm test -- --run
npm run build
```

最近一次视觉烟测覆盖本地可编辑入口的首页、时间线和照片墙：1440px 桌面端与 390px 移动端均通过，照片墙上传的截图按文件日期显示为 8 月 3 日，移动端没有横向溢出。截图与测试数据位于本地浏览器和 `.playwright-cli/`，不会写入 Supabase。

Service Worker 只缓存同源应用壳，不缓存 Supabase API、Auth、Storage 或照片 URL。

# Our Little Space

一个只属于两个人的回忆空间。当前仓库是移动优先的 PWA 演示版，核心页面收敛为首页、B1 相册页轴、照片、计划和设置。

## 当前功能

- 普通回忆和重要日子共用一条连续时间线
- 年度纪念日只保留一个原始节点，并动态显示下一次倒计时
- 时间线节点支持查看、编辑和删除；恋爱开始日为空时不会生成系统节点
- B1 相册页轴支持滚动显现、节点高亮、照片轻微缩放，并尊重减少动效设置
- 照片墙支持多选批量上传、图片压缩、进度、失败重试、编辑和删除
- 计划统一承载地点、餐厅、电影、礼物和共同待办
- 已完成计划可以预填充一条回忆，但只有主动保存后才会创建
- 首页展示恋爱时长、下一个重要日子、最近回忆、照片和进行中的计划

## Run locally

```bash
npm install
npm run dev
```

首次进入需要输入由 `VITE_SPACE_PASSWORD_HASH` 配置的固定密码。密码 hash 只在构建时注入前端，适合轻量访问门禁；公开演示的 Supabase 数据权限仍不是正式私密空间的安全边界。

## Local data boundary

默认本地模式使用 `localStorage` 保存空间元数据，使用 IndexedDB 保存压缩后的 WebP 图片；图片不会写入 `localStorage`。新版本会清除旧的 `love-space-demo-data` 示例键，空间首次打开为空。

当前支持两种运行模式：

- `VITE_DATA_MODE=local`：无需后端，每个浏览器独立保存。
- `VITE_DATA_MODE=supabase`：从 Postgres 加载空间数据，从 private Storage bucket 加载照片。

Supabase 模式需要先执行 `supabase/migrations/0001_initial.sql`，再配置 `.env.local`：

```text
VITE_DATA_MODE=supabase
VITE_PUBLIC_DEMO=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_SPACE_PATH=public-demo
VITE_SPACE_PASSWORD_HASH=sha256-hash-of-your-password
```

公开演示模式只用于展示，不承诺隐私，也不应上传真实私密照片。正式双方空间应关闭 `VITE_PUBLIC_DEMO`，创建成员关系并使用认证和 RLS。

## Permanent preview deployment

仓库包含 GitHub Pages 工作流。推送到 `main` 后会自动构建并发布，页面地址为：

```text
https://linkverb0510.github.io/love-space/
```

工作流默认使用 `VITE_DATA_MODE=supabase` 和公开演示空间；没有配置 GitHub Actions Secrets 时会自动回退为本地模式。要启用跨浏览器共享，在仓库 Settings -> Secrets and variables -> Actions 中添加：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

两者只应使用 Supabase 的 publishable/anon key，不要添加 `service_role` key。执行 `supabase/migrations/0001_initial.sql` 后，重新运行 `Deploy love space to GitHub Pages` 工作流即可。

生成密码 hash（不要把明文密码提交到 Git）：

```bash
node -e "console.log(require('crypto').createHash('sha256').update('your-password').digest('hex'))"
```

Vercel 仍可作为备用预览平台。构建命令为 `npm run build`，输出目录为 `dist`：

```bash
npm run build
npx vercel deploy dist --yes --prod --project <your-vercel-project>
```

发布构建产物可以避免把本地开发文件带到线上。没有 Supabase 配置时使用本地模式部署，链接可以展示完整 UI，但数据按浏览器隔离。Supabase 环境变量应在 Vercel 项目设置中配置，不要提交 `.env.local` 或密钥。

生产密钥不得提交到 Git。 

## Verification

```bash
npm test
npm run build
```

日期规则和数据迁移测试位于 `src/lib/*.test.ts`。PWA 使用标准 `manifest.webmanifest` 和 `public/sw.js`。

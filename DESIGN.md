# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-03
- Primary product surfaces: private access, dashboard, continuous timeline, photos, plans, settings
- Evidence reviewed: current React implementation, approved simplified product plan, mobile browser screenshots

## Brand
- Personality: intimate, calm, tactile, quietly optimistic, with a sweet-cool Lolita stationery accent
- Trust signals: private-space language, restrained status indicators, visible local save state
- Avoid: public social-media patterns, heavy gradients, noisy gamification, oversized marketing copy, and decoration that competes with real memories

## Product goals
- Goals: make important dates and everyday memories easy to revisit, keep shared intentions in one lightweight plan list, and make the current relationship state clear at a glance
- Non-goals: public sharing, chat, video, reminders, calendar view, separate collections, multi-space accounts, native apps, AI stories
- Success signals: both people can open the space on a phone, understand the current state in seconds, add a memory without friction, and find one plan list instead of choosing between duplicate features

## Personas and jobs
- Primary personas: two partners sharing one private space
- User jobs: remember, revisit, plan, and keep small shared intentions from disappearing
- Key contexts of use: quick phone check, adding a photo after an outing, recording an important day, and writing a memory from a completed plan

## Information architecture
- Primary navigation: 首页 / 时间线 / 照片 / 计划 / 设置
- Core routes/screens: private entry, dashboard, continuous timeline, independent photo wall, unified plan board, settings
- Content hierarchy: relationship state and next milestone first, recent memory second, open plans third
- Timeline model: ordinary memories and milestone nodes share one chronological surface; annual milestones keep one original node and derive their next occurrence

## Design principles
- One surface per user job: do not create separate pages for important dates and collections when the timeline and plans already express those jobs
- Relationship before administration: the dashboard should feel like a shared place, not a CRUD console
- Soft structure: clear sections, thin borders, restrained cards, and strong photo moments keep emotional content scannable
- Mobile first: touch targets, safe-area padding, bottom navigation, and sheet-style forms are default behavior
- Tradeoffs: warmth is allowed, but readability and predictable editing win over decoration

## Visual language
- Color: light linen `#FBF8F1` as the base, L sea blue `#5E9EBD` with ink `#365F76`, W pink `#D88EA5` with ink `#82495C`, warm gold `#C7A85F` for together, and deep red `#A64F61` for destructive actions
- Typography: DM Sans for interface text, DM Mono for metadata, Playfair Display for emotional emphasis
- Spacing/layout rhythm: generous desktop bands, compact repeated rows, 8px-or-less corner radii, larger breathing room around timeline entries
- Shape/radius/elevation: mostly flat surfaces, thin warm borders, restrained shadow only for sheets and toast layers
- Motion: small action lift, gentle image zoom, and one slow ribbon sway; motion is never required for comprehension and all non-essential motion is disabled under `prefers-reduced-motion`
- Imagery/iconography: real photos as primary content, Lucide icons for controls, and two small local L/W role illustrations used only in identity or empty-state surfaces

## Components
- Existing components to reuse: local buttons, navigation, timeline entry, plan row, photo card, bottom sheet, form fields, toast
- New/changed components: timeline milestone treatment, rope photo wall, multi-asset upload queue, memory attachment picker, photo detail sheet, edit forms, `RoleBadge`, `RolePicker`, the L/W role pair, and the shared `LaceTrim` / `RoseIllustration` / `LolitaPageDecor` decoration layer
- Variants and states: loading, empty, error, upload progress, upload failure/retry, complete, paused, destructive, active navigation, system relationship-start node
- Token/component ownership: global tokens remain in `src/styles.css` until a larger design system is justified

## Accessibility
- Target standard: WCAG 2.1 AA intent for contrast and keyboard access
- Keyboard/focus behavior: visible focus rings, labeled icon buttons, dialog semantics, no action conveyed by color alone
- Contrast/readability: charcoal text on light linen, role colors are always paired with L/W/一起/未标记 text, and text over photos receives a backing layer
- Screen-reader semantics: form labels, navigation labels, status toast, descriptive image alt text, explicit action labels
- Reduced motion and sensory considerations: short non-essential transitions only

## Responsive behavior
- Supported breakpoints/devices: desktop sidebar above 700px; mobile bottom navigation at or below 700px; target smoke check at 390px
- Layout adaptations: stacked relationship panels, full-width cards, alternating desktop rope wall, left-rope single-column mobile wall, bottom sheets with safe-area padding, compact action groups
- Touch/hover differences: persistent labels and larger hit areas on mobile; hover color/lift on desktop

## Interaction states
- Loading: local mode is synchronous; upload queue shows per-file preparation and persistence stages
- Empty: concise, encouraging empty states without feature tutorials
- Error: inline form validation, toast feedback, per-file upload failure and retry
- Success: toast confirmation plus visible data update
- Disabled: system relationship-start node cannot be deleted or edited from the ordinary timeline flow
- Offline/slow network, if applicable: local demo remains available; remote mode must later show stale/sync state
- Media fallback: unsupported HEIC preview keeps the original file available for download; a paired motion file is shown as a controlled video in the detail sheet
- Capture-date behavior: new uploads prefer EXIF capture time, then a date embedded in the filename, then file modification time and the caller's fallback date; existing records are not retroactively guessed
- Timeline attachment behavior: a new memory can queue image/video pairs after the memory row is saved, using its ID for `timelineEntryId`; editing an existing memory does not silently change its attachments
- Role behavior: L and W are content-author labels rather than permission roles; active identity is stored per space path in browser-local storage, while missing historical authors remain `unknown`
- Lolita decoration behavior: the Atelier treatment uses explicit scalloped SVG lace with edge dots, petal/core/leaf rose illustrations, and a double paper-card trim. Decorations use `aria-hidden`, `pointer-events: none`, low contrast, and stay behind real content; the home surface is mixed while timeline and photo surfaces use quieter L/W accents.

## Content voice
- Tone: personal, concise, warm, never promotional
- Terminology: use “回忆”, “重要日子”, “照片”, “计划”, “空间”; avoid “收藏夹” and enterprise terms
- Microcopy rules: explain consequences plainly, keep buttons action-oriented, avoid generic “提交”

## Implementation constraints
- Framework/styling system: React + TypeScript + Vite, hand-authored CSS, Lucide icons
- Design-token constraints: extend existing CSS variables; do not introduce a second styling system
- Performance constraints: batch photo selection is supported locally; originals remain untouched, while 720px thumbnails and 2048px display assets power the wall through `srcset`; remote display URLs are batch-signed and originals/motion assets are signed on demand; uploads are limited to two concurrent jobs
- Compatibility constraints: mobile-first layout, safe-area support, PWA manifest, HTTPS required for future production access
- Compatibility constraints: Live Photo uses a static image plus paired MOV/MP4 playback rather than native LivePhotosKit; HEIC preview remains browser-dependent
- Compatibility constraints: role data is additive and uses `unknown` for historical rows; apply `supabase/migrations/0004_roles.sql` only after backing up the target private space
- Test/screenshot expectations: unit-test capture-date precedence, media pairing, asset persistence and migration rules, run TypeScript build, smoke-test desktop and 390px mobile layouts with keyboard and reduced-motion checks

## Open questions
- [ ] Apply `supabase/migrations/0003_photo_assets.sql` to existing Supabase environments before remote multi-asset uploads
- [ ] Back up the private Supabase space, then apply `supabase/migrations/0004_roles.sql` before deploying role-marked content
- [ ] Production data migration and backup boundary / future backend phase

## Visual verification
- 1440px desktop: home, timeline, and photo wall keep the lace and rose shapes legible without covering controls; the photo wall still gives the uploaded image the largest visual area.
- 390px mobile: page decoration scales down, the photo wall remains a single rope column, bottom navigation keeps its safe-area padding, and `scrollWidth` does not exceed the viewport.
- Current local smoke data is browser-only. It is disposable test data and must not be treated as the private Supabase dataset.

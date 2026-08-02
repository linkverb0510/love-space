# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-02
- Primary product surfaces: private access, dashboard, continuous timeline, photos, plans, settings
- Evidence reviewed: current React implementation, approved simplified product plan, mobile browser screenshots

## Brand
- Personality: intimate, calm, tactile, quietly optimistic
- Trust signals: private-space language, restrained status indicators, visible local save state
- Avoid: public social-media patterns, heavy gradients, noisy gamification, oversized marketing copy, decorative hearts as the main visual language

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
- Color: Ecru paper `#F0E9DC` as the base, blush pink `#DDA0AB` for moments and destructive emphasis, denim blue `#6886A2` for timeline and actions, deep charcoal `#2F3033` for text
- Typography: DM Sans for interface text, DM Mono for metadata, Playfair Display for emotional emphasis
- Spacing/layout rhythm: generous desktop bands, compact repeated rows, 8px-or-less corner radii, larger breathing room around timeline entries
- Shape/radius/elevation: mostly flat surfaces, thin warm borders, restrained shadow only for sheets and toast layers
- Motion: small action lift and gentle image zoom; motion is never required for comprehension
- Imagery/iconography: real photos as primary content, Lucide icons for controls, no decorative SVG illustrations

## Components
- Existing components to reuse: local buttons, navigation, timeline entry, plan row, photo tile, bottom sheet, form fields, toast
- New/changed components: timeline milestone treatment, upload queue, plan preview, detail sheet, edit forms
- Variants and states: loading, empty, error, upload progress, upload failure/retry, complete, paused, destructive, active navigation, system relationship-start node
- Token/component ownership: global tokens remain in `src/styles.css` until a larger design system is justified

## Accessibility
- Target standard: WCAG 2.1 AA intent for contrast and keyboard access
- Keyboard/focus behavior: visible focus rings, labeled icon buttons, dialog semantics, no action conveyed by color alone
- Contrast/readability: charcoal text on Ecru, blue and blush used as accents, text over photos receives a backing layer
- Screen-reader semantics: form labels, navigation labels, status toast, descriptive image alt text, explicit action labels
- Reduced motion and sensory considerations: short non-essential transitions only

## Responsive behavior
- Supported breakpoints/devices: desktop sidebar above 700px; mobile bottom navigation at or below 700px; target smoke check at 390px
- Layout adaptations: stacked relationship panels, full-width cards, two-column photo wall, bottom sheets with safe-area padding, compact action groups
- Touch/hover differences: persistent labels and larger hit areas on mobile; hover color/lift on desktop

## Interaction states
- Loading: local mode is synchronous; upload queue shows per-file progress
- Empty: concise, encouraging empty states without feature tutorials
- Error: inline form validation, toast feedback, per-file upload failure and retry
- Success: toast confirmation plus visible data update
- Disabled: system relationship-start node cannot be deleted or edited from the ordinary timeline flow
- Offline/slow network, if applicable: local demo remains available; remote mode must later show stale/sync state

## Content voice
- Tone: personal, concise, warm, never promotional
- Terminology: use “回忆”, “重要日子”, “照片”, “计划”, “空间”; avoid “收藏夹” and enterprise terms
- Microcopy rules: explain consequences plainly, keep buttons action-oriented, avoid generic “提交”

## Implementation constraints
- Framework/styling system: React + TypeScript + Vite, hand-authored CSS, Lucide icons
- Design-token constraints: extend existing CSS variables; do not introduce a second styling system
- Performance constraints: batch photo selection is supported locally; future remote storage must resize display assets and avoid large initial payloads
- Compatibility constraints: mobile-first layout, safe-area support, PWA manifest, HTTPS required for future production access
- Test/screenshot expectations: unit-test date and migration rules, run TypeScript build, smoke-test desktop and 390px mobile layouts

## Open questions
- [ ] Supabase project, private path, password initialization, and storage bucket configuration / future backend phase
- [ ] Production data migration and backup boundary / future backend phase

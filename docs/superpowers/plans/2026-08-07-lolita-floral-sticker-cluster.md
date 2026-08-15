# Lolita Floral Sticker Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变导航、数据、照片和交互的前提下，为桌面端补充高品质玫瑰花束与单朵玫瑰贴纸，形成克制的 Lolita 风格留白排布。

**Architecture:** 继续使用 `MATERIAL_ASSETS` 作为素材许可和本地路径的唯一来源，并将新贴纸列入现有表面装饰数组。`LolitaPaperDecor` 和 `LolitaPageDecor` 只根据已有数组渲染额外桌面装饰；所有装饰维持 `pointer-events: none`，移动端仍严格限制为两项。

**Tech Stack:** React, TypeScript, Vitest, CSS, 本地 Twemoji CC BY 4.0 SVG。

## Global Constraints

- 新素材必须来自与现有甜点贴纸同一来源且许可可公开再分发。
- 所有图片必须保存在 `public/assets`，页面不得请求第三方图片地址。
- L 保持海蓝色语义，W 保持粉红色语义。
- 贴纸不能拦截点击、遮挡操作区域或产生横向滚动。
- 手机端每个页面继续最多保留一张主贴纸和一层材质，共两项。
- 不修改 Supabase、数据结构、上传流程、导航或业务交互。

---

### Task 1: Register Local Floral Assets

**Files:**
- Create: `public/assets/stickers/rose-bouquet.svg`
- Create: `public/assets/stickers/rose.svg`
- Modify: `src/lib/visual-assets.ts`
- Modify: `public/assets/ATTRIBUTIONS.md`
- Test: `src/lib/visual-assets.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_ASSETS satisfies Record<string, MaterialAsset>` and the local-asset manifest test.
- Produces: `MATERIAL_ASSETS.roseBouquet` and `MATERIAL_ASSETS.rose`, each with a local `src` and CC BY 4.0 attribution.

- [x] **Step 1: Write the failing asset-registry test**

```ts
it('registers local floral stickers with the existing dessert illustration license', () => {
  expect(MATERIAL_ASSETS.roseBouquet.src).toBe('/assets/stickers/rose-bouquet.svg');
  expect(MATERIAL_ASSETS.rose.src).toBe('/assets/stickers/rose.svg');
  expect(MATERIAL_ASSETS.roseBouquet.attribution.license).toBe('CC-BY-4.0');
  expect(MATERIAL_ASSETS.rose.attribution.license).toBe('CC-BY-4.0');
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/lib/visual-assets.test.ts`

Expected: FAIL because `roseBouquet` and `rose` are not yet registered.

- [x] **Step 3: Download the two reviewed Twemoji SVGs and add their manifest records**

```ts
roseBouquet: {
  src: '/assets/stickers/rose-bouquet.svg',
  kind: 'sticker',
  tone: 'rose',
  alt: '玫瑰花束贴纸',
  attribution: { creator: 'Twitter, Inc. and other contributors', license: 'CC-BY-4.0', sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f490.svg', modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。' }
}
```

Add a matching entry for `rose.svg` using source `assets/svg/1f339.svg`, and list both files in `ATTRIBUTIONS.md`.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run src/lib/visual-assets.test.ts`

Expected: PASS, including the test that the public directory exactly matches the asset manifest.

### Task 2: Define the Desktop-Only Sticker Cluster

**Files:**
- Modify: `src/lib/visual-assets.ts`
- Modify: `src/lib/visual-assets.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_ASSETS.roseBouquet` and `MATERIAL_ASSETS.rose`.
- Produces: Ordered decoration arrays where only desktop surfaces gain floral accents.

- [x] **Step 1: Write the failing surface-composition test**

```ts
it('adds floral clusters on desktop without increasing the mobile decoration budget', () => {
  expect(getSurfaceDecorations('home', 'desktop').map((asset) => asset.src)).toEqual([
    '/assets/materials/cotton-jersey-diffuse-cc0.jpg',
    '/assets/stickers/strawberry.svg',
    '/assets/stickers/ribbon.svg',
    '/assets/stickers/rose-bouquet.svg',
    '/assets/stickers/rose.svg'
  ]);
  expect(getSurfaceDecorations('home', 'mobile')).toHaveLength(2);
  expect(getSurfaceDecorations('timeline', 'mobile')).toHaveLength(2);
  expect(getSurfaceDecorations('photos', 'mobile')).toHaveLength(2);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/lib/visual-assets.test.ts`

Expected: FAIL because desktop surfaces have not yet received the floral assets.

- [x] **Step 3: Extend only desktop decoration arrays**

```ts
home: {
  desktop: [cottonLining, strawberry, ribbon, roseBouquet, rose],
  mobile: [cottonLining, strawberry]
}
```

Add `rose` to the desktop timeline array and `roseBouquet` to the desktop photos array. Keep plans and settings unchanged so utility surfaces remain restrained.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run src/lib/visual-assets.test.ts`

Expected: PASS; mobile surfaces retain their two-item budget.

### Task 3: Render and Position the Cluster Without Interaction Impact

**Files:**
- Modify: `src/components/LolitaDecor.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: the ordered desktop decoration arrays from `getSurfaceDecorations`.
- Produces: `cluster-main` and `cluster-detail` placements rendered only with `.material-desktop-only`.

- [x] **Step 1: Render the fourth and fifth home decorations**

```tsx
const [lining, , supportingSticker, clusterMain, clusterDetail] = getSurfaceDecorations('home');

{clusterMain && <MaterialSticker asset={clusterMain} placement="cluster-main" className="material-desktop-only" />}
{clusterDetail && <MaterialSticker asset={clusterDetail} placement="cluster-detail" className="material-desktop-only" />}
```

- [x] **Step 2: Render the fourth decoration on non-home pages**

```tsx
const [lining, primarySticker, supportingSticker, accentSticker] = getSurfaceDecorations(surface);

{accentSticker && <MaterialSticker asset={accentSticker} tone={tone} placement="cluster-accent" className="material-desktop-only" />}
```

- [x] **Step 3: Add bounded desktop positions and keep small screens unchanged**

```css
.material-paper-decor > .material-sticker-sticker[data-placement='cluster-main'] { top: 13px; right: 31%; width: 52px; height: 52px; transform: rotate(-7deg); }
.material-paper-decor > .material-sticker-sticker[data-placement='cluster-detail'] { top: 62px; right: 21%; width: 31px; height: 31px; transform: rotate(13deg); }
.lolita-page-decor-timeline > .material-sticker-sticker[data-placement='cluster-accent'] { top: 54px; right: 15%; width: 30px; height: 30px; transform: rotate(-11deg); }
.lolita-page-decor-photos > .material-sticker-sticker[data-placement='cluster-accent'] { top: 55px; right: 15%; width: 42px; height: 42px; transform: rotate(-8deg); }
```

Do not add a mobile override: `.material-desktop-only { display: none; }` already removes these extra items.

- [x] **Step 4: Run the complete automated suite and production build**

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run build`

Expected: PASS with no TypeScript or asset-resolution errors.

### Task 4: Visual and Interaction Verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the compiled local app and decorative CSS.
- Produces: screenshot and browser checks demonstrating no interaction or responsive regression.

- [x] **Step 1: Capture desktop screenshots**

Run the local site at `1440x1000` and capture Home, Timeline, and Photos. Confirm flowers, bow, and dessert stickers form a light diagonal cluster in whitespace and no text, buttons, cards, or photos are covered.

- [x] **Step 2: Capture mobile screenshots and inspect overflow**

Run the local site at `390x844`, capture Home and Photos, and evaluate:

```js
({
  noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  decorativeImagesLocal: [...document.images].filter((image) => image.src.includes('/assets/')).every((image) => new URL(image.src).pathname.startsWith('/assets/'))
})
```

Expected: `noHorizontalOverflow: true` and `decorativeImagesLocal: true`; only the original mobile material-and-primary-sticker pair is visible.

- [x] **Step 3: Confirm decoration cannot intercept interaction**

Inspect the rendered `.material-sticker` elements and verify their computed `pointer-events` value is `none`.

## Self-Review

- Spec coverage: desktop receives a larger but related rose/bow/dessert arrangement; mobile remains compact; local licensing and attribution are recorded; functional UI is protected by pointer-event and overflow checks.
- Placeholder scan: no TODO or undefined handoff exists.
- Type consistency: assets remain `MaterialAsset` entries; decoration arrays continue returning `readonly MaterialAsset[]`; existing `MaterialSticker` API is unchanged.

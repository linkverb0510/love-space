import type { ActiveRole } from './roles';

export type VisualSurface = 'home' | 'timeline' | 'photos' | 'plans' | 'settings';
export type VisualViewport = 'desktop' | 'mobile';
export type MaterialAssetKind = 'paper' | 'lace' | 'tape' | 'stamp' | 'sticker' | 'character';
export type MaterialTone = 'blush' | 'rose' | 'berry' | 'neutral';

export type MaterialAttribution = {
  creator: string;
  license: 'CC0-1.0' | 'CC-BY-4.0';
  sourceUrl: string;
  modification: string;
};

export type MaterialAsset = {
  src: string;
  kind: MaterialAssetKind;
  tone: MaterialTone;
  alt?: string;
  attribution: MaterialAttribution;
};

export type RoleAccent = {
  main: '#5E9EBD' | '#D88EA5';
  detail: '#365F76' | '#923D5A';
};

export const MATERIAL_ASSETS = {
  cottonLining: {
    src: '/assets/materials/cotton-jersey-diffuse-cc0.jpg',
    kind: 'paper',
    tone: 'blush',
    alt: '浅粉棉织物内衬',
    attribution: {
      creator: 'colormass; Rico Cilliers',
      license: 'CC0-1.0',
      sourceUrl: 'https://polyhaven.com/a/cotton_jersey',
      modification: '从原始 1K 漫反射贴图裁切为本地低对比背景材质；未改变图案内容。'
    }
  },
  strawberry: {
    src: '/assets/stickers/strawberry.svg',
    kind: 'sticker',
    tone: 'berry',
    alt: '草莓贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f353.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  },
  cherries: {
    src: '/assets/stickers/cherries.svg',
    kind: 'sticker',
    tone: 'berry',
    alt: '樱桃贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f352.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  },
  shortcake: {
    src: '/assets/stickers/shortcake.svg',
    kind: 'sticker',
    tone: 'rose',
    alt: '草莓蛋糕贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f370.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  },
  strawberryDrink: {
    src: '/assets/stickers/strawberry-drink.svg',
    kind: 'sticker',
    tone: 'blush',
    alt: '饮料杯贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f964.svg',
      modification: '未修改图稿；与草莓贴纸组合使用以表达草莓饮品。'
    }
  },
  ribbon: {
    src: '/assets/stickers/ribbon.svg',
    kind: 'sticker',
    tone: 'rose',
    alt: '蝴蝶结贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f380.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  },
  roseBouquet: {
    src: '/assets/stickers/rose-bouquet.svg',
    kind: 'sticker',
    tone: 'rose',
    alt: '玫瑰花束贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f490.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  },
  rose: {
    src: '/assets/stickers/rose.svg',
    kind: 'sticker',
    tone: 'berry',
    alt: '玫瑰贴纸',
    attribution: {
      creator: 'Twitter, Inc. and other contributors',
      license: 'CC-BY-4.0',
      sourceUrl: 'https://github.com/jdecked/twemoji/blob/main/assets/svg/1f339.svg',
      modification: '未修改图稿；页面仅以 CSS 添加白色 die-cut 边和投影。'
    }
  }
} satisfies Record<string, MaterialAsset>;

const surfaceDecorations: Record<VisualSurface, Record<VisualViewport, readonly MaterialAsset[]>> = {
  home: {
    desktop: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.strawberry, MATERIAL_ASSETS.ribbon, MATERIAL_ASSETS.roseBouquet, MATERIAL_ASSETS.rose],
    mobile: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.strawberry]
  },
  timeline: {
    desktop: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.cherries, MATERIAL_ASSETS.ribbon, MATERIAL_ASSETS.rose],
    mobile: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.cherries]
  },
  photos: {
    desktop: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.shortcake, MATERIAL_ASSETS.ribbon, MATERIAL_ASSETS.roseBouquet],
    mobile: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.shortcake]
  },
  plans: {
    desktop: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.ribbon],
    mobile: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.ribbon]
  },
  settings: {
    desktop: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.strawberryDrink],
    mobile: [MATERIAL_ASSETS.cottonLining, MATERIAL_ASSETS.strawberryDrink]
  }
};

export function getSurfaceDecorations(surface: VisualSurface, viewport: VisualViewport = 'desktop'): readonly MaterialAsset[] {
  return surfaceDecorations[surface][viewport];
}

export function getRoleAccent(role: ActiveRole): RoleAccent {
  return role === 'l'
    ? { main: '#5E9EBD', detail: '#365F76' }
    : { main: '#D88EA5', detail: '#923D5A' };
}

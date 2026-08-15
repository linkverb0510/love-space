export type LolitaSurface = 'home' | 'timeline' | 'photos';
export type LolitaSurfaceTone = 'mixed' | 'l' | 'w';

const SURFACE_TONES: Record<LolitaSurface, LolitaSurfaceTone> = {
  home: 'mixed',
  timeline: 'l',
  photos: 'w'
};

const SURFACE_LABELS: Record<LolitaSurface, string> = {
  home: 'L / W 共同记录',
  timeline: 'L 的海蓝色时间线',
  photos: 'W 的粉色照片墙'
};

export function getLolitaSurfaceTone(surface: LolitaSurface): LolitaSurfaceTone {
  return SURFACE_TONES[surface];
}

export function getLolitaSurfaceLabel(surface: LolitaSurface): string {
  return SURFACE_LABELS[surface];
}

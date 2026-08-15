import { describe, expect, it } from 'vitest';
import { getLolitaSurfaceTone, getLolitaSurfaceLabel } from './lolita';

describe('Lolita surface semantics', () => {
  it('keeps the home surface mixed while content surfaces use quieter accents', () => {
    expect(getLolitaSurfaceTone('home')).toBe('mixed');
    expect(getLolitaSurfaceTone('timeline')).toBe('l');
    expect(getLolitaSurfaceTone('photos')).toBe('w');
  });

  it('provides readable labels for decorative surface semantics', () => {
    expect(getLolitaSurfaceLabel('home')).toBe('L / W 共同记录');
    expect(getLolitaSurfaceLabel('timeline')).toBe('L 的海蓝色时间线');
    expect(getLolitaSurfaceLabel('photos')).toBe('W 的粉色照片墙');
  });
});

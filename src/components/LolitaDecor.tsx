import { useState } from 'react';
import { getSurfaceDecorations, type MaterialAsset, type MaterialAssetKind, type MaterialTone } from '../lib/visual-assets';
import type { LolitaSurface, LolitaSurfaceTone } from '../lib/lolita';
import { getLolitaSurfaceLabel, getLolitaSurfaceTone } from '../lib/lolita';

type MaterialStickerProps = {
  asset?: MaterialAsset;
  src?: string;
  kind?: MaterialAssetKind;
  tone?: MaterialTone | LolitaSurfaceTone;
  alt?: string;
  placement?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  decorative?: boolean;
};

export function MaterialSticker({
  asset,
  src,
  kind = asset?.kind ?? 'sticker',
  tone = asset?.tone ?? 'rose',
  alt = asset?.alt,
  placement = 'default',
  size = 'md',
  className = '',
  decorative = true
}: MaterialStickerProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src ?? asset?.src;

  if (failed && kind === 'character') return null;

  return (
    <span
      className={`material-sticker material-sticker-${kind} material-sticker-${size} ${className}`.trim()}
      data-placement={placement}
      data-tone={tone}
      data-kind={kind}
      data-missing={failed ? 'true' : 'false'}
      aria-hidden={decorative ? true : undefined}
    >
      {resolvedSrc && <img src={resolvedSrc} alt={decorative ? '' : alt ?? ''} onError={() => setFailed(true)} />}
    </span>
  );
}

export function LolitaPaperDecor({ tone = 'mixed' }: { tone?: LolitaSurfaceTone }) {
  const [lining, , supportingSticker, clusterMain, clusterDetail] = getSurfaceDecorations('home');

  return (
    <div className="material-paper-decor" aria-hidden="true">
      <MaterialSticker asset={lining} placement="surface" />
      <MaterialSticker asset={supportingSticker} tone={tone} placement="top-right" className="material-desktop-only" />
      {clusterMain && <MaterialSticker asset={clusterMain} placement="cluster-main" className="material-desktop-only" />}
      {clusterDetail && <MaterialSticker asset={clusterDetail} placement="cluster-detail" className="material-desktop-only" />}
    </div>
  );
}

export function LolitaPageDecor({ surface }: { surface: LolitaSurface }) {
  const tone = getLolitaSurfaceTone(surface);
  const [lining, primarySticker, supportingSticker, accentSticker] = getSurfaceDecorations(surface);

  if (surface === 'home') return null;

  return (
    <div
      className={`lolita-page-decor lolita-page-decor-${surface}`}
      data-tone={tone}
      data-surface-label={getLolitaSurfaceLabel(surface)}
      aria-hidden="true"
    >
      <MaterialSticker asset={lining} placement="surface" />
      <MaterialSticker asset={primarySticker} tone={tone} placement="top-right" />
      {supportingSticker && <MaterialSticker asset={supportingSticker} tone={tone} placement="top-left" className="material-desktop-only" />}
      {accentSticker && <MaterialSticker asset={accentSticker} placement="cluster-accent" className="material-desktop-only" />}
    </div>
  );
}

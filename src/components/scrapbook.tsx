import type { CSSProperties, ReactNode } from 'react';

type Tone = 'pink' | 'blue' | 'gold';
type TapePosition = 'left' | 'right' | 'center';

/** 斜贴在容器上缘的和纸胶带(纯装饰)。父容器需要 position:relative。 */
export function WashiTape({ tone = 'pink', to = 'left', className = '' }: { tone?: Tone; to?: TapePosition; className?: string }) {
  return <span aria-hidden="true" className={`tape tape-${tone} tape-${to} ${className}`.trim()} />;
}

/** 拍立得白框:厚下边 + 手写图注。 */
export function PolaroidFrame({
  caption,
  children,
  rotate = 0,
  className = '',
  style
}: {
  caption?: string;
  children: ReactNode;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <figure className={`polaroid ${className}`.trim()} style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, margin: 0, ...style }}>
      <div className="polaroid-body">{children}</div>
      {caption && <figcaption className="polaroid-caption">{caption}</figcaption>}
    </figure>
  );
}

/** 邮票齿孔白框,适合包住徽章、插画等小件。 */
export function StampFrame({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`stamp-frame ${className}`.trim()} style={style}>
      {children}
    </span>
  );
}

/** 圆形邮戳:数字 + 小字标签,微微倾斜像盖上去的日期章。 */
export function Postmark({ value, label, tilt = true, className = '' }: { value: ReactNode; label?: string; tilt?: boolean; className?: string }) {
  return (
    <span className={`postmark ${tilt ? 'postmark-tilt' : ''} ${className}`.trim()}>
      <span className="postmark-ring">
        <span className="postmark-value">{value}</span>
        {label && <span className="postmark-label">{label}</span>}
      </span>
    </span>
  );
}

/** 票据存根外壳:左侧打孔虚线 + 上下圆缺口,包住存根内容。 */
export function TicketStub({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`ticket-stub ${className}`.trim()}>
      <span className="ticket-notch-top" aria-hidden="true" />
      {children}
      <span className="ticket-notch-bottom" aria-hidden="true" />
    </span>
  );
}

/** 35mm 胶片齿孔分隔条。 */
export function FilmStripDivider({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`film-strip ${className}`.trim()} />;
}

/** 便利贴:柔和底色 + 折角阴影。 */
export function StickyNote({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`sticky-note ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

/** 手写标题下的缝线短划装饰。 */
export function StitchLine({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`stitch-line ${className}`.trim()} />;
}

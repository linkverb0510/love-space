import type { Transition, Variants } from 'motion/react';

/** 页面切换用的通用缓动与变体,供 App 各视图复用。 */

export const easeOutExpo: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const springSoft: Transition = { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 };
export const springSnappy: Transition = { type: 'spring', stiffness: 420, damping: 34 };

export const viewFadeRise: { initial: { opacity: number; y: number }; animate: { opacity: number; y: number }; exit: { opacity: number; y: number }; transition: Transition } = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.26, ease: easeOutExpo }
};

/** 列表容器:子项依次落纸 */
export const stackStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } }
};

export const itemFallIntoPlace: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: easeOutExpo } }
};

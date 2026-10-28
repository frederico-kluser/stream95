import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useMotionUITheme, useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { cn } from '@/lib/utils';

const TRAVEL = 14;

/**
 * A number that rolls up when it grows and down when it shrinks (theme `snap` spring). With
 * reduced motion it only crossfades ("calm") or swaps instantly ("off").
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const { motionMode } = useMotionUITheme();
  const snap = useMotionUITransition('snap');
  const [last, setLast] = useState(value);
  const [direction, setDirection] = useState(1);
  if (value !== last) {
    setDirection(value > last ? 1 : -1);
    setLast(value);
  }
  const travel = motionMode === 'full' ? TRAVEL : 0;
  const variants = {
    enter: (d: number) => ({ y: d * travel, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (d: number) => ({ y: d * -travel, opacity: 0 }),
  };
  return (
    <span className={cn('relative inline-flex justify-center overflow-hidden tabular-nums', className)}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          variants={variants}
          initial={motionMode === 'off' ? false : 'enter'}
          animate="center"
          exit={motionMode === 'off' ? undefined : 'exit'}
          transition={motionMode === 'off' ? { duration: 0 } : snap}
        >
          {value.toLocaleString('pt-BR')}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

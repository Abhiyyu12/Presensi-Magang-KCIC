import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import {
  DURATION,
  EASE_OUT_EXPO,
  SPRING,
  fadeUp,
  staggerParent,
} from '../lib/motion';

// Wrapper animasi masuk yang dipakai ulang antar halaman. Semua gerak hanya
// transform + opacity; MotionConfig reducedMotion="user" mematikan spasial
// otomatis bila user memilih reduce.

interface RevealProps extends HTMLMotionProps<'div'> {
  delay?: number;
}

export function Reveal({ delay = 0, ...props }: RevealProps) {
  return <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay }} {...props} />;
}

export function Stagger({
  children,
  className,
  stagger = 0.045,
  ...props
}: HTMLMotionProps<'div'> & { stagger?: number }) {
  return (
    <motion.div
      className={className}
      variants={staggerParent(stagger)}
      initial="hidden"
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div className={className} variants={fadeUp} {...props}>
      {children}
    </motion.div>
  );
}

// Angka menghitung naik saat PERTAMA muncul saja; perubahan data berikutnya
// (refresh/filter) langsung tampil tanpa animasi ulang. Tabular-nums diwarisi
// dari body sehingga lebar stabil. Durasi ≤700ms.
export function AnimatedNumber({
  value,
  className,
}: {
  value: number | undefined;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number | undefined>(value);
  const started = useRef(false);

  useEffect(() => {
    if (value === undefined) return;
    if (reduce || started.current) {
      setDisplay(value);
      return;
    }
    started.current = true;
    const controls = animate(0, value, {
      duration: Math.min(DURATION.hero, 0.7),
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduce]);

  if (display === undefined) return <span className={className}>-</span>;
  return <span className={className}>{display}</span>;
}

export { SPRING };

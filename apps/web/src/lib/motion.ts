import type { Transition, Variants } from 'motion/react';

// Token motion terpusat — "kecepatan yang terkendali": cepat, presisi, berhenti
// mulus. Nilai easing sama dengan --ease-out-strong / --ease-in-out-strong di
// index.css; jangan membuat kurva baru di luar file ini.
export const DURATION = {
  instant: 0.1,
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
  hero: 0.6,
} as const;

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];

// Spring untuk elemen interaktif: stiffness sedang, damping tinggi, tanpa bounce.
export const SPRING: Transition = { type: 'spring', stiffness: 300, damping: 30 };

const enter = (transition: Transition) => ({ hidden: { opacity: 0 }, show: { opacity: 1, transition } });

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT_EXPO } },
};
export const fadeIn: Variants = enter({ duration: DURATION.base, ease: EASE_OUT_EXPO });
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: { duration: DURATION.base, ease: EASE_OUT_EXPO } },
};
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: DURATION.base, ease: EASE_OUT_EXPO } },
};

export const staggerParent = (stagger = 0.045): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

export const springTransition: Transition = SPRING;

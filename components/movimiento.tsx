"use client";

import { MotionConfig } from "motion/react";

/** Las animaciones de motion respetan «reducir movimiento» del teléfono. */
export function Movimiento({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

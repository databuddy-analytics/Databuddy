"use client";

import { useMemo, useRef } from "react";

import { DotMatrixBase } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { isWithinCircularMask } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotAnimationResolver, DotMatrixCommonProps } from "../../core";

export type DotmCircular17Props = DotMatrixCommonProps;

const BASE_OPACITY = 0.07;
const MID_OPACITY = 0.34;
const HIGH_OPACITY = 0.95;
/** Discrete checker frames per loop (must stay integer for `(row + col + t) % 2`). */
const CHECKER_STEPS = 4;

export function DotmCircular17({
  speed = 1.55,
  animated = true,
  hoverAnimated = false,
  ...rest
}: DotmCircular17Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const animPhase = useCyclePhase({
    active: !reducedMotion && matrixPhase !== "idle",
    cycleMsBase: 1500,
    speed
  });

  const animPhaseRef = useRef(animPhase);
  animPhaseRef.current = animPhase;

  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ row, col, phase: dmxPhase }) => {
      if (!isWithinCircularMask(row, col)) {
        return { className: "dmx-inactive" };
      }

      const holdStill = reducedMotion || dmxPhase === "idle";
      const t = holdStill
        ? 0
        : Math.floor(animPhaseRef.current * CHECKER_STEPS) % CHECKER_STEPS;
      const parity = (row + col + t) % 2;
      const brailleBias = col === 1 || col === 3;
      const centerBias = row === 2 || col === 2;

      let opacity = BASE_OPACITY;
      if (parity === 0 && brailleBias) {
        opacity = HIGH_OPACITY;
      } else if (parity === 0 || centerBias) {
        opacity = MID_OPACITY;
      } else if (brailleBias) {
        opacity = 0.24;
      }

      return { style: { opacity } };
    };
  }, [reducedMotion]);

  return (
    <DotMatrixBase
      {...rest}
      size={rest.size ?? 36}
      dotSize={rest.dotSize ?? 5}
      speed={speed}
      pattern="full"
      animated={animated}
      phase={matrixPhase}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      reducedMotion={reducedMotion}
      animationResolver={resolver}
    />
  );
}

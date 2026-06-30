"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle8Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;

const BASE_OPACITY = 0.05;
const MID_OPACITY = 0.42;
const HIGH_OPACITY = 0.96;

const TRIANGLE_CELLS = new Set([
  "1,3",
  "2,2",
  "2,4",
  "3,1",
  "3,3",
  "3,5",
  "4,0",
  "4,2",
  "4,4",
  "4,6"
]);

const LEFT_WING = new Set(["2,2", "3,1", "4,0", "4,2"]);
const RIGHT_WING = new Set(["2,4", "3,5", "4,4", "4,6"]);

function isWithinTriangleMask(row: number, col: number): boolean {
  if (row < 0 || row >= MATRIX_SIZE || col < 0 || col >= MATRIX_SIZE) {
    return false;
  }

  return TRIANGLE_CELLS.has(`${row},${col}`);
}

type Sector = "left" | "right" | "spine" | "none";

function sectorForCell(row: number, col: number): Sector {
  const key = `${row},${col}`;
  if (row === 1 && col === 3) {
    return "spine";
  }
  if (row === 3 && col === 3) {
    return "spine";
  }
  if (LEFT_WING.has(key)) {
    return "left";
  }
  if (RIGHT_WING.has(key)) {
    return "right";
  }
  return "none";
}

/**
 * Alternating emphasis on the two lower wings (split by the apex column), with the apex and
 * heart dot brightest when energy crosses the middle (both sides briefly equal).
 */
function opacityForCell(row: number, col: number, phase: number): number {
  const p = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const leftLift = p * p;
  const rightLift = (1 - p) * (1 - p);
  const crossover = Math.max(0, 1 - 4 * (p - 0.5) * (p - 0.5));

  const sector = sectorForCell(row, col);
  if (sector === "none") {
    return 0;
  }

  if (sector === "spine") {
    if (row === 1 && col === 3) {
      const apex = MID_OPACITY + crossover * (HIGH_OPACITY - MID_OPACITY) * 0.95;
      return Math.min(HIGH_OPACITY, apex);
    }
    const hub = BASE_OPACITY + crossover * 0.55 * (HIGH_OPACITY - BASE_OPACITY) + leftLift * 0.08 + rightLift * 0.08;
    return Math.min(HIGH_OPACITY, hub);
  }

  if (sector === "left") {
    const wing = BASE_OPACITY + leftLift * (HIGH_OPACITY - BASE_OPACITY);
    return Math.min(HIGH_OPACITY, wing);
  }

  const wing = BASE_OPACITY + rightLift * (HIGH_OPACITY - BASE_OPACITY);
  return Math.min(HIGH_OPACITY, wing);
}

export function DotmTriangle8({
  size = 30,
  dotSize = 6.5,
  color = "currentColor",
  ariaLabel = "Loading",
  className,
  muted = false,
  dotClassName,
  speed = 1.55,
  animated = true,
  hoverAnimated = false,
  cellPadding,
  opacityBase,
  opacityMid,
  opacityPeak
}: DotmTriangle8Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const cycleActive = !reducedMotion && matrixPhase !== "idle";
  const cyclePhase = useCyclePhase({
    active: cycleActive,
    cycleMsBase: 1500,
    speed
  });

  const gap =
    cellPadding ?? Math.max(1, Math.floor((size - dotSize * MATRIX_SIZE) / (MATRIX_SIZE - 1)));
  const matrixSize = dotSize * MATRIX_SIZE + gap * (MATRIX_SIZE - 1);
  const rootStyle = {
    width: stylePx(cellPadding == null ? size : matrixSize),
    height: stylePx(cellPadding == null ? size : matrixSize),
    color
  } as CSSProperties;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cx("dmx-root", muted && "dmx-muted", className)}
      style={rootStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="dmx-grid"
        style={{
          gap,
          gridTemplateColumns: `repeat(${MATRIX_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${MATRIX_SIZE}, minmax(0, 1fr))`
        }}
      >
        {Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }).map((_, index) => {
          const row = Math.floor(index / MATRIX_SIZE);
          const col = index % MATRIX_SIZE;
          const isActive = isWithinTriangleMask(row, col);

          const phase = reducedMotion || matrixPhase === "idle" ? 0.25 : cyclePhase;
          const opacity = isActive ? opacityForCell(row, col, phase) : 0;

          return (
            <span
              key={index}
              aria-hidden="true"
              className={cx("dmx-dot", !isActive && "dmx-inactive", dotClassName)}
              style={{
                width: stylePx(dotSize),
                height: stylePx(dotSize),
                opacity: styleOpacity(remapOpacityToTriplet(opacity, opacityBase, opacityMid, opacityPeak))
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

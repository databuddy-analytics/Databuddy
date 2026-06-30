"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle14Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;

const BASE_OPACITY = 0.07;
const MID_OPACITY = 0.32;
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

function isWithinTriangleMask(row: number, col: number): boolean {
  if (row < 0 || row >= MATRIX_SIZE || col < 0 || col >= MATRIX_SIZE) {
    return false;
  }

  return TRIANGLE_CELLS.has(`${row},${col}`);
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * A soft vertical “pillar” of brightness sweeps column 0→6; only masked dots respond,
 * so the triangle appears to light one vertical slice at a time (not a cell path).
 */
function opacityForCell(row: number, col: number, phase: number): number {
  const beamCenter = phase * 7.2 - 0.35;
  const dist = Math.abs(col - beamCenter);
  const core = 1 - smoothstep01(0, 0.62, dist);
  const halo = 1 - smoothstep01(0.35, 1.42, dist);
  const eased = core * 0.92 + halo * 0.22;
  let opacity = BASE_OPACITY + eased * (HIGH_OPACITY - BASE_OPACITY);

  if (row === 3 && col === 3) {
    opacity = Math.max(opacity, MID_OPACITY + eased * 0.28);
  }

  return Math.min(HIGH_OPACITY, opacity);
}

export function DotmTriangle14({
  size = 30,
  dotSize = 6.5,
  color = "currentColor",
  ariaLabel = "Loading",
  className,
  muted = false,
  dotClassName,
  speed = 1.45,
  animated = true,
  hoverAnimated = false,
  cellPadding,
  opacityBase,
  opacityMid,
  opacityPeak
}: DotmTriangle14Props) {
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

          const phase = reducedMotion || matrixPhase === "idle" ? 0.12 : cyclePhase;
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

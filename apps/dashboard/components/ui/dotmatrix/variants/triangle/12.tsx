"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle12Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;

const BASE_OPACITY = 0.06;
const MID_OPACITY = 0.34;
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
 * Anti-diagonal harmonics on `row - col`: bands glide along NE–SW lines through the mask,
 * opposite oblique motion to loaders keyed on `row + col`.
 */
function opacityForCell(row: number, col: number, phase: number): number {
  const skew = row - col;
  const t = phase * Math.PI * 2;
  const u = skew * 0.62 - t * 1.45;
  const primary = 0.5 + 0.5 * Math.cos(u);
  const harmonic = 0.5 + 0.5 * Math.cos(u * 2 - 0.55);
  const pSoft = smoothstep01(0.12, 0.95, primary);
  const hSoft = smoothstep01(0.38, 0.92, harmonic);
  const crest = pSoft * pSoft * 0.88 + Math.max(0, hSoft - 0.42) * 0.32;
  let opacity = BASE_OPACITY + crest * (HIGH_OPACITY - BASE_OPACITY);

  if (row === 3 && col === 3) {
    opacity = Math.max(opacity, MID_OPACITY + (crest - 0.22) * 0.4);
  }

  return Math.min(HIGH_OPACITY, opacity);
}

export function DotmTriangle12({
  size = 30,
  dotSize = 6.5,
  color = "currentColor",
  ariaLabel = "Loading",
  className,
  muted = false,
  dotClassName,
  speed = 1.5,
  animated = true,
  hoverAnimated = false,
  cellPadding,
  opacityBase,
  opacityMid,
  opacityPeak
}: DotmTriangle12Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const cycleActive = !reducedMotion && matrixPhase !== "idle";
  const cyclePhase = useCyclePhase({
    active: cycleActive,
    cycleMsBase: 2300,
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

          const phase = reducedMotion || matrixPhase === "idle" ? 0.2 : cyclePhase;
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

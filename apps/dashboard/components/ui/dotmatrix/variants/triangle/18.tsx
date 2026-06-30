"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle18Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;

const CORE_DIM = 0.1;
const SHELL_LOW = 0.22;
const SHELL_HIGH = 0.96;

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
 * Heart cell stays dim while the outer shell breathes in sync — inverted emphasis vs center-led
 * corona loaders.
 */
function opacityForCell(row: number, col: number, phase: number): number {
  if (row === 3 && col === 3) {
    return CORE_DIM;
  }

  const breathe = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const crest = smoothstep01(0.2, 0.94, breathe);
  return SHELL_LOW + crest * (SHELL_HIGH - SHELL_LOW);
}

export function DotmTriangle18({
  size = 30,
  dotSize = 6.5,
  color = "currentColor",
  ariaLabel = "Loading",
  className,
  muted = false,
  dotClassName,
  speed = 1.6,
  animated = true,
  hoverAnimated = false,
  cellPadding,
  opacityBase,
  opacityMid,
  opacityPeak
}: DotmTriangle18Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const cycleActive = !reducedMotion && matrixPhase !== "idle";
  const cyclePhase = useCyclePhase({
    active: cycleActive,
    cycleMsBase: 1600,
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

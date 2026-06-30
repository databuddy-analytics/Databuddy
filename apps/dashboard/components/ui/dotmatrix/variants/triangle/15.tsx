"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { useCyclePhase } from "../../hooks";
import { usePrefersReducedMotion } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle15Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;

const BASE_OPACITY = 0.08;
const MID_OPACITY = 0.38;
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

/** Apex and the two base corners — the three natural vertices of the silhouette. */
const HUBS: ReadonlyArray<readonly [number, number]> = [
  [1, 3],
  [4, 0],
  [4, 6]
];

function isWithinTriangleMask(row: number, col: number): boolean {
  if (row < 0 || row >= MATRIX_SIZE || col < 0 || col >= MATRIX_SIZE) {
    return false;
  }

  return TRIANGLE_CELLS.has(`${row},${col}`);
}

function manhattan(aRow: number, aCol: number, bRow: number, bCol: number): number {
  return Math.abs(aRow - bRow) + Math.abs(aCol - bCol);
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function falloffFromHub(row: number, col: number, hub: readonly [number, number]): number {
  const d = manhattan(row, col, hub[0], hub[1]);
  return 1 - smoothstep01(0, 5.4, d);
}

/**
 * Energy orbits the three triangle vertices (apex → left base → right base) on a continuous phase,
 * with soft Manhattan falloff — no lattice mod groups.
 */
function opacityForCell(row: number, col: number, phase: number): number {
  const t = phase * Math.PI * 2;
  const sharp = 4;
  const u0 = Math.max(0, Math.cos(t)) ** sharp;
  const u1 = Math.max(0, Math.cos(t - (Math.PI * 2) / 3)) ** sharp;
  const u2 = Math.max(0, Math.cos(t - (Math.PI * 4) / 3)) ** sharp;
  const sum = u0 + u1 + u2 + 1e-4;

  const glowA = falloffFromHub(row, col, HUBS[0]!);
  const glowB = falloffFromHub(row, col, HUBS[1]!);
  const glowC = falloffFromHub(row, col, HUBS[2]!);
  const glow = (glowA * u0 + glowB * u1 + glowC * u2) / sum;

  let opacity = BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);

  if (row === 3 && col === 3) {
    opacity = Math.max(opacity, MID_OPACITY + glow * 0.32);
  }

  return Math.min(HIGH_OPACITY, opacity);
}

export function DotmTriangle15({
  size = 30,
  dotSize = 6.5,
  color = "currentColor",
  ariaLabel = "Loading",
  className,
  muted = false,
  dotClassName,
  speed = 1.8,
  animated = true,
  hoverAnimated = false,
  cellPadding,
  opacityBase,
  opacityMid,
  opacityPeak
}: DotmTriangle15Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const cycleActive = !reducedMotion && matrixPhase !== "idle";
  const cyclePhase = useCyclePhase({
    active: cycleActive,
    cycleMsBase: 1100,
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

          const phase = reducedMotion || matrixPhase === "idle" ? 0.15 : cyclePhase;
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

"use client";

import type { CSSProperties } from "react";

import { cx } from "../../core";
import { useDotMatrixPhases } from "../../hooks";
import { styleOpacity, stylePx } from "../../core";
import { remapOpacityToTriplet } from "../../core";
import { usePrefersReducedMotion } from "../../hooks";
import { useSteppedCycle } from "../../hooks";
import type { DotMatrixCommonProps } from "../../core";

export type DotmTriangle4Props = DotMatrixCommonProps;

const MATRIX_SIZE = 7;
const STEP_COUNT = 28;
const BASE_OPACITY = 0.0;
const MID_OPACITY = 0.0;
const HIGH_OPACITY = 0.96;
const TRAIL_LEVELS = [HIGH_OPACITY, 0.52, 0.3] as const;

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

const PERIMETER_PATH: ReadonlyArray<readonly [number, number]> = [
  [1, 3],
  [2, 2],
  [3, 1],
  [4, 0],
  [4, 2],
  [4, 4],
  [4, 6],
  [3, 5],
  [2, 4]
];

function isWithinTriangleMask(row: number, col: number): boolean {
  if (row < 0 || row >= MATRIX_SIZE || col < 0 || col >= MATRIX_SIZE) {
    return false;
  }

  return TRIANGLE_CELLS.has(`${row},${col}`);
}

export function DotmTriangle4({
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
}: DotmTriangle4Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed
  });
  const step = useSteppedCycle({
    active: !reducedMotion && matrixPhase !== "idle",
    cycleMsBase: 1450,
    steps: STEP_COUNT,
    speed,
  });

  const frame = reducedMotion || matrixPhase === "idle" ? 0 : step;
  const segmentLength = Math.max(1, Math.floor(STEP_COUNT / 3));

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

          let opacity = 0;
          if (isActive) {
            opacity = row === 3 && col === 3 ? MID_OPACITY : BASE_OPACITY;

            for (let headOffset = 0; headOffset < 3; headOffset += 1) {
              const spokeFrame = (frame + headOffset * segmentLength) % STEP_COUNT;
              const head = Math.floor((spokeFrame / STEP_COUNT) * PERIMETER_PATH.length);

              for (let trail = 0; trail < TRAIL_LEVELS.length; trail += 1) {
                const idx = (head - trail + PERIMETER_PATH.length) % PERIMETER_PATH.length;
                const [pathRow, pathCol] = PERIMETER_PATH[idx]!;
                if (row === pathRow && col === pathCol) {
                  opacity = Math.max(opacity, TRAIL_LEVELS[trail]!);
                  break;
                }
              }
            }
          }

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

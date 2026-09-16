"use client";

import type { CSSProperties } from "react";
import type { DotMatrixPhase } from "./types";

export type MatrixPattern = "diamond" | "full" | "outline" | "rose" | "cross" | "rings";

export interface DotMatrixCommonProps {
  size?: number;
  dotSize?: number;
  color?: string;
  speed?: number;
  ariaLabel?: string;
  className?: string;
  pattern?: MatrixPattern;
  muted?: boolean;
  animated?: boolean;
  hoverAnimated?: boolean;
  dotClassName?: string;
  opacityBase?: number;
  opacityMid?: number;
  opacityPeak?: number;
  cellPadding?: number;
  boxSize?: number;
  minSize?: number;
}

interface DotAnimationContext {
  index: number;
  row: number;
  col: number;
  distanceFromCenter: number;
  angleFromCenter: number;
  radiusNormalized: number;
  manhattanDistance: number;
  phase: DotMatrixPhase;
  isActive: boolean;
  reducedMotion: boolean;
}

interface DotAnimationState {
  className?: string;
  style?: CSSProperties;
}

export type DotAnimationResolver = (ctx: DotAnimationContext) => DotAnimationState;

export function cx(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(" ");
}

export const MATRIX_SIZE = 5;
const CENTER = Math.floor(MATRIX_SIZE / 2);
const RANGE = Array.from({ length: MATRIX_SIZE }, (_, index) => index);
const MAX_RADIUS = Math.hypot(CENTER, CENTER);

const FULL_INDEXES = RANGE.flatMap((row) => RANGE.map((col) => rowMajorIndex(row, col)));

const DIAMOND_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return Math.abs(row - CENTER) + Math.abs(col - CENTER) <= 2;
});

const OUTLINE_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return row === 0 || row === MATRIX_SIZE - 1 || col === 0 || col === MATRIX_SIZE - 1;
});

const CROSS_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return row === CENTER || col === CENTER;
});

const RINGS_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  const radius = Math.hypot(row - CENTER, col - CENTER);
  return Math.round(radius) === 1 || Math.round(radius) === 2;
});

const ROSE_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  const dx = col - CENTER;
  const dy = row - CENTER;
  const angle = Math.atan2(dy, dx);
  const radius = Math.hypot(dx, dy);
  const rose = Math.abs(Math.sin(3 * angle));
  return rose > 0.6 && radius >= 1;
});

const PATTERN_INDEXES: Record<MatrixPattern, number[]> = {
  diamond: DIAMOND_INDEXES,
  full: FULL_INDEXES,
  outline: OUTLINE_INDEXES,
  rose: ROSE_INDEXES,
  cross: CROSS_INDEXES,
  rings: RINGS_INDEXES
};

function getPatternIndexes(pattern: MatrixPattern = "diamond"): number[] {
  return PATTERN_INDEXES[pattern];
}

export function rowMajorIndex(row: number, col: number): number {
  return row * MATRIX_SIZE + col;
}

function indexToCoord(index: number): { row: number; col: number } {
  return {
    row: Math.floor(index / MATRIX_SIZE),
    col: index % MATRIX_SIZE
  };
}

function distanceFromCenter(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER);
}

function polarAngle(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.atan2(row - CENTER, col - CENTER);
}

function normalizedRadius(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER) / MAX_RADIUS;
}

function manhattanDistance(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.abs(row - CENTER) + Math.abs(col - CENTER);
}

const N = MATRIX_SIZE;
const CELLS = N * N;
const MAX_TRBL = (N - 1) * 2;

export function trBlPathNormFromIndex(index: number): number {
  const { row, col } = indexToCoord(index);
  return (row + (N - 1 - col)) / MAX_TRBL;
}

function buildSpiralInwardOrderToIndexMap(): number[] {
  const order = new Array<number>(CELLS);
  let top = 0;
  let bottom = N - 1;
  let left = 0;
  let right = N - 1;
  let t = 0;

  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col += 1) {
      order[rowMajorIndex(top, col)] = t;
      t += 1;
    }

    for (let row = top + 1; row <= bottom; row += 1) {
      order[rowMajorIndex(row, right)] = t;
      t += 1;
    }

    if (top < bottom) {
      for (let col = right - 1; col >= left; col -= 1) {
        order[rowMajorIndex(bottom, col)] = t;
        t += 1;
      }
    }

    if (left < right) {
      for (let row = bottom - 1; row > top; row -= 1) {
        order[rowMajorIndex(row, left)] = t;
        t += 1;
      }
    }

    top += 1;
    bottom -= 1;
    left += 1;
    right -= 1;
  }

  return order;
}

const SPIRAL_INWARD_ORDER: readonly number[] = buildSpiralInwardOrderToIndexMap();

export function spiralInwardNormFromIndex(index: number): number {
  return SPIRAL_INWARD_ORDER[index]! / (CELLS - 1);
}

export function spiralInwardOrderValue(index: number): number {
  return SPIRAL_INWARD_ORDER[index]!;
}

const CORNER_COORDS = new Set(["0,0", "0,4", "4,0", "4,4"]);

export function isWithinCircularMask(row: number, col: number): boolean {
  return !CORNER_COORDS.has(`${row},${col}`);
}

export function stylePx(n: number): string {
  return `${n}px`;
}

export function styleOpacity(opacity: number): number {
  return Math.round(opacity * 1e6) / 1e6;
}

const SOURCE_BASE_OPACITY = 0.08;
const SOURCE_MID_OPACITY = 0.34;
const SOURCE_PEAK_OPACITY = 0.94;

function lerpDmx(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function normalizeProgressDmx(value: number, start: number, end: number): number {
  const span = end - start;
  if (Math.abs(span) < Number.EPSILON) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - start) / span));
}

function coerceOpacityDmx(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
}

export function remapOpacityToTriplet(
  opacity: number,
  opacityBase: number | undefined,
  opacityMid: number | undefined,
  opacityPeak: number | undefined
): number {
  if (!Number.isFinite(opacity)) {
    return opacity;
  }

  const hasOverrides = opacityBase !== undefined || opacityMid !== undefined || opacityPeak !== undefined;
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (!hasOverrides) {
    return safeOpacity;
  }

  const targetBase = coerceOpacityDmx(opacityBase) ?? SOURCE_BASE_OPACITY;
  const targetMid = coerceOpacityDmx(opacityMid) ?? SOURCE_MID_OPACITY;
  const targetPeak = coerceOpacityDmx(opacityPeak) ?? SOURCE_PEAK_OPACITY;

  if (safeOpacity <= SOURCE_BASE_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, 0, SOURCE_BASE_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(0, targetBase, progress)));
  }

  if (safeOpacity <= SOURCE_MID_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, SOURCE_BASE_OPACITY, SOURCE_MID_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(targetBase, targetMid, progress)));
  }

  if (safeOpacity <= SOURCE_PEAK_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, SOURCE_MID_OPACITY, SOURCE_PEAK_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(targetMid, targetPeak, progress)));
  }

  const progress = normalizeProgressDmx(safeOpacity, SOURCE_PEAK_OPACITY, 1);
  return Math.min(1, Math.max(0, lerpDmx(targetPeak, 1, progress)));
}

function getMatrix5Layout(
  size: number,
  dotSize: number,
  cellPadding?: number
): { gap: number; matrixSpan: number } {
  const n = MATRIX_SIZE;
  if (cellPadding != null) {
    const g = Math.max(0, cellPadding);
    const matrixSpan = dotSize * n + g * (n - 1);
    return { gap: g, matrixSpan };
  }
  const g = Math.max(1, Math.floor((size - dotSize * n) / (n - 1)));
  return { gap: g, matrixSpan: size };
}

function resolveDmxBoxOuterDim(
  options: { boxSize?: number; minSize?: number } | null | undefined
): { outerDim: number; useWrapper: boolean } {
  const b = options?.boxSize;
  const hasBox = b != null && b > 0 && Number.isFinite(b);
  if (!hasBox) {
    return { outerDim: 0, useWrapper: false };
  }
  const m = options?.minSize;
  if (m != null && m > 0 && Number.isFinite(m)) {
    return { outerDim: Math.max(b, m), useWrapper: true };
  }
  return { outerDim: b, useWrapper: true };
}

function clamp01Dmx(n: number | undefined) {
  if (n == null) {
    return;
  }
  if (!Number.isFinite(n)) {
    return;
  }
  return Math.min(1, Math.max(0, n));
}

interface DotMatrixBaseProps extends DotMatrixCommonProps {
  phase: DotMatrixPhase;
  reducedMotion?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  animationResolver?: DotAnimationResolver;
}

export function DotMatrixBase({
  size = 24,
  dotSize = 3,
  color = "currentColor",
  speed = 1,
  ariaLabel = "Loading",
  className,
  pattern = "diamond",
  muted = false,
  dotClassName,
  phase,
  reducedMotion = false,
  onMouseEnter,
  onMouseLeave,
  animationResolver,
  opacityBase,
  opacityMid,
  opacityPeak,
  cellPadding,
  boxSize,
  minSize
}: DotMatrixBaseProps) {
  const patternIndexes = new Set(getPatternIndexes(pattern));
  const safeSpeed = speed > 0 ? speed : 1;
  const speedScale = 1 / safeSpeed;
  const { gap, matrixSpan } = getMatrix5Layout(size, dotSize, cellPadding);
  const { outerDim, useWrapper } = resolveDmxBoxOuterDim({ boxSize, minSize });
  const scale = useWrapper && matrixSpan > 0 ? outerDim / matrixSpan : 1;
  const center = Math.floor(MATRIX_SIZE / 2);
  const ob = clamp01Dmx(opacityBase);
  const om = clamp01Dmx(opacityMid);
  const op = clamp01Dmx(opacityPeak);
  const unit = dotSize + gap;

  const dmxVarStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "middle",
    width: matrixSpan,
    height: matrixSpan,
    "--dmx-speed": speedScale,
    color,
    ...(ob !== undefined && { ["--dmx-opacity-base" as const]: ob }),
    ...(om !== undefined && { ["--dmx-opacity-mid" as const]: om }),
    ...(op !== undefined && { ["--dmx-opacity-peak" as const]: op }),
    ...(useWrapper
      ? {
          transform: `scale(${scale})`,
          transformOrigin: "center center" as const
        }
      : { minWidth: minSize, minHeight: minSize })
  } as unknown as CSSProperties;

  const dots = Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }).map((_, index) => {
    const { row, col } = indexToCoord(index);
    const isActive = patternIndexes.has(index);
    const distance = distanceFromCenter(index);
    const angle = polarAngle(index);
    const radiusNormalizedValue = normalizedRadius(index);
    const manhattan = manhattanDistance(index);
    const deltaX = (col - center) * unit;
    const deltaY = (row - center) * unit;

    const animationState = animationResolver
      ? animationResolver({
          index,
          row,
          col,
          distanceFromCenter: distance,
          angleFromCenter: angle,
          radiusNormalized: radiusNormalizedValue,
          manhattanDistance: manhattan,
          phase,
          isActive,
          reducedMotion
        })
      : {};

    const resolvedAnimationStyle = animationState.style ? { ...animationState.style } : undefined;
    const rawOpacity = resolvedAnimationStyle?.opacity;
    if (resolvedAnimationStyle != null && typeof rawOpacity === "number") {
      resolvedAnimationStyle.opacity = remapOpacityToTriplet(rawOpacity, ob, om, op);
    }

    const dotStyle = {
      display: "block",
      width: dotSize,
      height: dotSize,
      borderRadius: 999,
      background: "currentColor",
      transform: "none",
      transformOrigin: "center",
      opacity: "calc(0.5 * (var(--dmx-opacity-base) + var(--dmx-opacity-mid)))",
      "--dmx-distance": distance,
      "--dmx-row": row,
      "--dmx-col": col,
      "--dmx-x": `${deltaX}px`,
      "--dmx-y": `${deltaY}px`,
      "--dmx-angle": angle,
      "--dmx-radius": radiusNormalizedValue,
      "--dmx-manhattan": manhattan,
      ...resolvedAnimationStyle,
      ...(!isActive
        ? {
            opacity: 0,
            visibility: "hidden" as const,
            pointerEvents: "none" as const,
            animation: "none"
          }
        : {})
    } as CSSProperties;

    return (
      <span
        key={index}
        aria-hidden="true"
        className={cx("dmx-dot", !isActive && "dmx-inactive", dotClassName, animationState.className)}
        style={dotStyle}
      />
    );
  });

  const matrix = (
    <div className={cx("dmx-root", muted && "dmx-muted", !useWrapper && className)} style={dmxVarStyle}>
      <div
        className="dmx-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "repeat(5, minmax(0, 1fr))",
          gap
        }}
      >
        {dots}
      </div>
    </div>
  );

  if (useWrapper) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: outerDim,
          height: outerDim,
          minWidth: minSize,
          minHeight: minSize,
          overflow: "hidden"
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {matrix}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cx("dmx-root", muted && "dmx-muted", className)}
      style={dmxVarStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="dmx-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "repeat(5, minmax(0, 1fr))",
          gap
        }}
      >
        {dots}
      </div>
    </div>
  );
}

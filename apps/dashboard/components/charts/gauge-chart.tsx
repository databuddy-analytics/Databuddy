"use client";

import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type GaugeRating = "good" | "needs-improvement" | "poor";

type GaugeChartProps = {
	/** Current value to display */
	value: number;
	/** Maximum value for the gauge (100% fill) */
	max: number;
	/** Rating determines the color */
	rating: GaugeRating;
	/** Size of the chart in pixels */
	size?: number;
	/** Format the center label value */
	formatValue?: (value: number) => string;
	/** Optional unit to display below the value */
	unit?: string;
	/** Number of tick marks */
	tickCount?: number;
	/** Starting angle in degrees (-90 = top, 0 = right, 90 = bottom) */
	startAngle?: number;
	/** Sweep angle in degrees (360 = full circle) */
	sweepAngle?: number;
};

const RATING_COLORS: Record<GaugeRating, string> = {
	good: "#10b981",
	"needs-improvement": "#f59e0b",
	poor: "#ef4444",
};

export const GaugeChart = memo(function GaugeChart({
	value,
	max,
	rating,
	size = 120,
	formatValue,
	unit,
	tickCount = 36,
	startAngle = -90,
	sweepAngle = 360,
}: GaugeChartProps) {
	const springValue = useSpring(value / max, {
		stiffness: 300,
		damping: 30,
		bounce: 0,
	});

	const [displayProgress, setDisplayProgress] = useState(value / max);

	useEffect(() => {
		springValue.set(Math.max(0, Math.min(value / max, 1)));
	}, [value, max, springValue]);

	useMotionValueEvent(springValue, "change", (latest) => {
		setDisplayProgress(latest);
	});

	const displayValue = formatValue
		? formatValue(value)
		: Math.round(value).toString();

	const activeColor = RATING_COLORS[rating];

	const padding = 8;
	const cx = size / 2;
	const cy = size / 2;
	const radius = size / 2 - padding;
	const tickLength = size * 0.12;
	const tickWidth = Math.max(2, size * 0.025);

	const activeTicks = Math.floor(displayProgress * tickCount);

	// Dynamic font sizing
	const innerRadius = radius - tickLength - 4;
	const maxTextWidth = innerRadius * 1.4;
	const charCount = displayValue.length + (unit ? unit.length * 0.6 : 0);
	const baseFontSize = size * 0.22;
	const scaledFontSize = Math.min(
		baseFontSize,
		maxTextWidth / (charCount * 0.55)
	);
	const valueFontSize = Math.round(Math.max(12, scaledFontSize));
	const unitFontSize = Math.round(valueFontSize * 0.5);

	return (
		<div
			className="relative flex items-center justify-center"
			style={{ width: size, height: size }}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0"
				height={size}
				viewBox={`0 0 ${size} ${size}`}
				width={size}
			>
				{Array.from({ length: tickCount }).map((_, i) => {
					const t = tickCount > 1 ? i / (tickCount - 1) : 0;
					const angle = startAngle + t * sweepAngle;
					const angleRad = (angle * Math.PI) / 180;

					const x1 = cx + (radius - tickLength) * Math.cos(angleRad);
					const y1 = cy + (radius - tickLength) * Math.sin(angleRad);
					const x2 = cx + radius * Math.cos(angleRad);
					const y2 = cy + radius * Math.sin(angleRad);

					const isActive = i < activeTicks;

					return (
						<motion.line
							animate={{
								stroke: isActive ? activeColor : "hsl(var(--muted))",
								strokeOpacity: isActive ? 1 : 0.35,
							}}
							initial={false}
							key={i}
							strokeLinecap="round"
							strokeWidth={tickWidth}
							transition={{
								type: "spring",
								stiffness: 300,
								damping: 30,
							}}
							x1={x1}
							x2={x2}
							y1={y1}
							y2={y2}
						/>
					);
				})}
			</svg>
			<div
				className={cn(
					"relative z-10 flex items-baseline justify-center gap-0.5"
				)}
			>
				<span
					className="font-semibold text-foreground tabular-nums"
					style={{ fontSize: valueFontSize, lineHeight: 1 }}
				>
					{displayValue}
				</span>
				{unit ? (
					<span
						className="text-muted-foreground"
						style={{ fontSize: unitFontSize, lineHeight: 1 }}
					>
						{unit}
					</span>
				) : null}
			</div>
		</div>
	);
});

export type { GaugeRating, GaugeChartProps };

"use client";

import { cn } from "@/lib/utils";
import {
	keyboardStep,
	quantityFromSliderFraction,
	sliderFractionFromQuantity,
	TOPUP_MAX_QUANTITY,
	TOPUP_MIN_QUANTITY,
	type TopupTier,
	TOPUP_TIERS,
} from "@databuddy/shared/billing/topup-math";
import { motion, useSpring, useTransform } from "motion/react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface CreditArcSliderProps {
	className?: string;
	max?: number;
	min?: number;
	onValueChange: (value: number) => void;
	tiers?: readonly TopupTier[];
	unit?: string;
	value: number;
}

const ARC_SIZE = 320;
const ARC_CENTER_X = ARC_SIZE / 2;
const ARC_CENTER_Y = 150;
const ARC_RADIUS = 130;
const ARC_STROKE_WIDTH = 14;
const ARC_VIEWBOX_HEIGHT = 178;

function polarToCartesian(fraction: number) {
	const angle = Math.PI - fraction * Math.PI;
	return {
		x: ARC_CENTER_X + ARC_RADIUS * Math.cos(angle),
		y: ARC_CENTER_Y - ARC_RADIUS * Math.sin(angle),
	};
}

const TRACK_START = polarToCartesian(0);
const TRACK_END = polarToCartesian(1);
const ARC_LENGTH = Math.PI * ARC_RADIUS;

const TRACK_PATH = `M ${TRACK_START.x} ${TRACK_START.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${TRACK_END.x} ${TRACK_END.y}`;

export function CreditArcSlider({
	value,
	onValueChange,
	min = TOPUP_MIN_QUANTITY,
	max = TOPUP_MAX_QUANTITY,
	tiers = TOPUP_TIERS,
	unit = "credits",
	className,
}: CreditArcSliderProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const fraction = useMemo(() => sliderFractionFromQuantity(value), [value]);

	const spring = useSpring(fraction, {
		stiffness: 260,
		damping: 28,
		mass: 0.6,
	});

	useEffect(() => {
		spring.set(fraction);
	}, [fraction, spring]);

	const dashOffset = useTransform(
		spring,
		(f) => ARC_LENGTH - Math.max(0, Math.min(1, f)) * ARC_LENGTH
	);
	const thumbX = useTransform(
		spring,
		(f) =>
			ARC_CENTER_X +
			ARC_RADIUS * Math.cos(Math.PI - Math.max(0, Math.min(1, f)) * Math.PI)
	);
	const thumbY = useTransform(
		spring,
		(f) =>
			ARC_CENTER_Y -
			ARC_RADIUS * Math.sin(Math.PI - Math.max(0, Math.min(1, f)) * Math.PI)
	);

	const clampToRange = useCallback(
		(q: number) => Math.max(min, Math.min(max, q)),
		[min, max]
	);

	const fractionFromEvent = useCallback((clientX: number, clientY: number) => {
		const svg = svgRef.current;
		if (!svg) {
			return 0;
		}
		const rect = svg.getBoundingClientRect();
		const scaleX = ARC_SIZE / rect.width;
		const scaleY = ARC_VIEWBOX_HEIGHT / rect.height;
		const px = (clientX - rect.left) * scaleX;
		const py = (clientY - rect.top) * scaleY;
		const dx = px - ARC_CENTER_X;
		const dy = py - ARC_CENTER_Y;
		let angle = Math.atan2(-dy, dx);
		if (angle < 0) {
			angle = dx < 0 ? Math.PI : 0;
		} else if (angle > Math.PI) {
			angle = Math.PI;
		}
		return 1 - angle / Math.PI;
	}, []);

	const setFromPointer = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			const f = fractionFromEvent(e.clientX, e.clientY);
			onValueChange(clampToRange(quantityFromSliderFraction(f)));
		},
		[fractionFromEvent, clampToRange, onValueChange]
	);

	const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		setIsDragging(true);
		containerRef.current?.setPointerCapture(e.pointerId);
		containerRef.current?.focus();
		setFromPointer(e);
	};

	const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (isDragging) {
			setFromPointer(e);
		}
	};

	const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		setIsDragging(false);
		if (containerRef.current?.hasPointerCapture(e.pointerId)) {
			containerRef.current.releasePointerCapture(e.pointerId);
		}
	};

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		const step = keyboardStep(value);
		const pageJump = Math.max(step * 10, Math.round((max - min) / 20));
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				e.preventDefault();
				onValueChange(clampToRange(value - step));
				break;
			case "ArrowRight":
			case "ArrowUp":
				e.preventDefault();
				onValueChange(clampToRange(value + step));
				break;
			case "PageDown":
				e.preventDefault();
				onValueChange(clampToRange(value - pageJump));
				break;
			case "PageUp":
				e.preventDefault();
				onValueChange(clampToRange(value + pageJump));
				break;
			case "Home":
				e.preventDefault();
				onValueChange(min);
				break;
			case "End":
				e.preventDefault();
				onValueChange(max);
				break;
			default:
				break;
		}
	};

	const tickBoundaries = useMemo(() => {
		return tiers
			.filter((t): t is TopupTier & { to: number } => t.to !== "inf")
			.map((t) => t.to);
	}, [tiers]);

	return (
		<div
			aria-label="Credits to buy"
			aria-orientation="horizontal"
			aria-valuemax={max}
			aria-valuemin={min}
			aria-valuenow={Math.round(value)}
			className={cn(
				"relative w-full cursor-pointer touch-none select-none rounded-2xl outline-none",
				"focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				className
			)}
			onKeyDown={handleKeyDown}
			onLostPointerCapture={handlePointerUp}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			ref={containerRef}
			role="slider"
			tabIndex={0}
		>
			<svg
				aria-hidden="true"
				className="block w-full"
				ref={svgRef}
				viewBox={`0 0 ${ARC_SIZE} ${ARC_VIEWBOX_HEIGHT}`}
			>
				<defs>
					<linearGradient id="credit-arc-fill" x1="0%" x2="100%" y1="0%" y2="0%">
						<stop offset="0%" stopColor="var(--primary)" stopOpacity="0.55" />
						<stop offset="100%" stopColor="var(--primary)" stopOpacity="1" />
					</linearGradient>
					<filter
						height="200%"
						id="credit-arc-thumb-shadow"
						width="200%"
						x="-50%"
						y="-50%"
					>
						<feDropShadow
							dx="0"
							dy="2"
							floodColor="var(--primary)"
							floodOpacity="0.35"
							stdDeviation="3"
						/>
					</filter>
				</defs>

				<path
					d={TRACK_PATH}
					fill="none"
					stroke="var(--border)"
					strokeLinecap="round"
					strokeOpacity="0.5"
					strokeWidth={ARC_STROKE_WIDTH}
				/>

				{tickBoundaries.map((boundary) => {
					const f = sliderFractionFromQuantity(boundary);
					const angle = Math.PI - f * Math.PI;
					const labelPos = {
						x: ARC_CENTER_X + (ARC_RADIUS + 16) * Math.cos(angle),
						y: ARC_CENTER_Y - (ARC_RADIUS + 16) * Math.sin(angle),
					};
					return (
						<text
							className="fill-muted-foreground font-medium text-[10px] tabular-nums"
							dominantBaseline="middle"
							key={`label-${boundary}`}
							textAnchor="middle"
							x={labelPos.x}
							y={labelPos.y}
						>
							{boundary >= 1000 ? `${boundary / 1000}k` : boundary}
						</text>
					);
				})}

				<motion.path
					d={TRACK_PATH}
					fill="none"
					stroke="url(#credit-arc-fill)"
					strokeDasharray={ARC_LENGTH}
					strokeDashoffset={dashOffset}
					strokeLinecap="round"
					strokeWidth={ARC_STROKE_WIDTH}
				/>

				<motion.circle
					cx={thumbX}
					cy={thumbY}
					fill="var(--background)"
					filter="url(#credit-arc-thumb-shadow)"
					r={isDragging ? 12 : 10}
					stroke="var(--primary)"
					strokeWidth={3}
				/>

				<text
					className="fill-foreground font-semibold text-[38px] tabular-nums"
					dominantBaseline="middle"
					textAnchor="middle"
					x={ARC_CENTER_X}
					y={ARC_CENTER_Y - 28}
				>
					{Math.round(value).toLocaleString()}
				</text>
				<text
					className="fill-muted-foreground text-[11px] uppercase tracking-wider"
					dominantBaseline="middle"
					textAnchor="middle"
					x={ARC_CENTER_X}
					y={ARC_CENTER_Y - 4}
				>
					{unit}
				</text>
			</svg>
		</div>
	);
}

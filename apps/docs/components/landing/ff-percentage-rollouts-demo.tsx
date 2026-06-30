"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EASE, useRevealOnScroll } from "@/components/landing/demo-primitives";
const SPLIT_TRANSITION = "120ms cubic-bezier(0.16, 1, 0.3, 1)";

const BAR_H = 52;
const ACTIVE_H = 36;
const INACTIVE_H = 16;

export function FFPercentageRolloutsDemo() {
	const { ref, visible } = useRevealOnScroll();
	const trackRef = useRef<HTMLDivElement>(null);
	const [percent, setPercent] = useState(30);
	const draggingRef = useRef(false);
	const rafRef = useRef(0);

	const setFromClientX = useCallback((clientX: number) => {
		const track = trackRef.current;
		if (!track) {
			return;
		}
		const rect = track.getBoundingClientRect();
		const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
		setPercent(Math.round((x / rect.width) * 100));
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			draggingRef.current = true;
			setFromClientX(e.clientX);
		},
		[setFromClientX]
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!draggingRef.current) {
				return;
			}
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
			rafRef.current = requestAnimationFrame(() => setFromClientX(e.clientX));
		},
		[setFromClientX]
	);

	const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		draggingRef.current = false;
		try {
			e.currentTarget.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}, []);

	useEffect(
		() => () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		},
		[]
	);

	return (
		<div className="relative w-full" ref={ref}>
			<div
				className="overflow-hidden rounded-lg border border-white/[0.06]"
				style={{
					opacity: visible ? 1 : 0,
					transform: visible ? "translateY(0)" : "translateY(8px)",
					transition: `opacity 600ms ${EASE}, transform 600ms ${EASE}`,
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-white/[0.06] border-b px-3.5 py-2.5">
					<span className="font-medium text-muted-foreground text-sm">
						Rollout Percentage
					</span>
					<span
						className="font-mono font-semibold text-foreground text-sm tabular-nums"
						style={{ transition: `opacity ${SPLIT_TRANSITION}` }}
					>
						{percent}%
					</span>
				</div>

				{/* Bar */}
				<div
					aria-label="Rollout percentage"
					aria-valuemax={100}
					aria-valuemin={0}
					aria-valuenow={percent}
					className="relative cursor-col-resize touch-none select-none overflow-hidden px-3.5"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					ref={trackRef}
					role="slider"
					style={{ height: `${BAR_H}px` }}
					tabIndex={0}
				>
					{/* Inactive ticks — full width, short, dim */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-x-3.5"
						style={{
							height: `${INACTIVE_H}px`,
							top: `${(BAR_H - INACTIVE_H) / 2}px`,
							backgroundImage:
								"repeating-linear-gradient(to right, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 2px, transparent 2px, transparent 8px)",
						}}
					/>

					{/* Active ticks — clipped to percent%, tall, bright */}
					<div
						aria-hidden
						className="pointer-events-none absolute top-0 bottom-0 left-3.5 overflow-hidden"
						style={{
							width: `calc(${percent}% - 1.75rem)`,
							transition: `width ${SPLIT_TRANSITION}`,
						}}
					>
						<div
							className="absolute inset-x-0"
							style={{
								height: `${ACTIVE_H}px`,
								top: `${(BAR_H - ACTIVE_H) / 2}px`,
								backgroundImage:
									"repeating-linear-gradient(to right, rgba(255,255,255,0.82) 0, rgba(255,255,255,0.82) 2px, transparent 2px, transparent 8px)",
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

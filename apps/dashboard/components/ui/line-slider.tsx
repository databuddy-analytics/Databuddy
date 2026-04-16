"use client";

import { motion, useMotionValueEvent, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LineSliderProps {
	className?: string;
	max?: number;
	min?: number;
	onValueChange: (value: number) => void;
	value: number;
}

export function LineSlider({
	value,
	onValueChange,
	min = 0,
	max = 100,
	className = "",
}: LineSliderProps) {
	const sliderRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [lineCount, setLineCount] = useState(0);

	const springValue = useSpring(value, {
		bounce: 0,
		stiffness: 300,
		damping: 30,
	});

	const [displayValue, setDisplayValue] = useState(value);

	useEffect(() => {
		springValue.set(value);
	}, [value, springValue]);

	useMotionValueEvent(springValue, "change", (latest) => {
		if (!isDragging) {
			setDisplayValue(latest);
		}
	});

	const lineWidth = 1; // px
	const lineGap = 2; // px

	// Calculate line count based on container width
	useEffect(() => {
		const updateLineCount = () => {
			if (!sliderRef.current) {
				return;
			}
			const innerWidth = sliderRef.current.clientWidth - 4;
			const count = Math.floor(innerWidth / (lineWidth + lineGap));
			setLineCount(count);
		};

		// Initial update
		updateLineCount();

		// Use ResizeObserver for better detection of size changes
		const resizeObserver = new ResizeObserver(() => {
			updateLineCount();
		});

		if (sliderRef.current) {
			resizeObserver.observe(sliderRef.current);
		}

		// Fallback to window resize
		window.addEventListener("resize", updateLineCount);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", updateLineCount);
		};
	}, []);

	const updateValue = (clientX: number) => {
		if (!sliderRef.current) {
			return;
		}
		const rect = sliderRef.current.getBoundingClientRect();
		const x = clientX - rect.left;
		const percentage = Math.max(0, Math.min(1, x / rect.width));
		const newValue = (min + percentage * (max - min)).toFixed(0);
		onValueChange(Number(newValue));
	};

	const handlePointerDown = (e: React.PointerEvent) => {
		setIsDragging(true);
		sliderRef.current?.setPointerCapture(e.pointerId);
		updateValue(e.clientX);
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!isDragging) {
			return;
		}
		updateValue(e.clientX);
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		setIsDragging(false);
		sliderRef.current?.releasePointerCapture(e.pointerId);
	};

	// Calculate which lines should be "active" based on value
	const renderValue = isDragging ? value : displayValue;
	const percentage = Math.max(
		0,
		Math.min(1, (renderValue - min) / (max - min))
	);
	const activeLines = Math.floor(percentage * lineCount);

	return (
		<div
			className={cn(
				"flex h-8 w-full cursor-ew-resize touch-none select-none items-stretch justify-center gap-[2px] rounded border px-1 py-1",
				className
			)}
			onLostPointerCapture={handlePointerUp}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			ref={sliderRef}
		>
			{Array.from({ length: lineCount }).map((_, index) => {
				const isActive = index < activeLines;
				return (
					<motion.div
						animate={{
							backgroundColor: isActive
								? "var(--foreground)"
								: "var(--muted-foreground)",
							opacity: isActive ? 1 : 0.4,
							scaleY: isActive ? 1 : 0.7,
						}}
						className="h-full w-px rounded-full"
						initial={false}
						key={index.toString()}
						transition={{
							type: "spring",
							stiffness: 300,
							damping: 30,
						}}
					/>
				);
			})}
		</div>
	);
}

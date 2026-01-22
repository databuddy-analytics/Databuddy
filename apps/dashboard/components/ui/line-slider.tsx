"use client";

import { cn } from"@/lib/utils";
import { motion, useMotionValueEvent, useSpring } from"framer-motion";
import { useEffect, useRef, useState } from"react";

interface LineSliderProps {
	value: number;
	onValueChange: (value: number) => void;
	min?: number;
	max?: number;
	className?: string;
}

export function LineSlider({
	value,
	onValueChange,
	min = 0,
	max = 100,
	className ="",
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

	useMotionValueEvent(springValue,"change", (latest) => {
		if (!isDragging) {
			setDisplayValue(latest);
		}
	});

	const lineWidth = 1; // px
	const lineGap = 2; // px

	// Calculate line count based on container width
	useEffect(() => {
		const updateLineCount = () => {
			if (!sliderRef.current) return;
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
		if (!sliderRef.current) return;
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
		if (!isDragging) return;
		updateValue(e.clientX);
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		setIsDragging(false);
		sliderRef.current?.releasePointerCapture(e.pointerId);
	};

	// Calculate which lines should be"active" based on value
	const renderValue = isDragging ? value : displayValue;
	const percentage = Math.max(0, Math.min(1, (renderValue - min) / (max - min)));
	const activeLines = Math.floor(percentage * lineCount);

	return (
		<div
			ref={sliderRef}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onLostPointerCapture={handlePointerUp}
			className={cn(
				"flex items-stretch justify-center gap-[2px] border h-8 py-1 px-1 cursor-ew-resize select-none touch-none w-full",
				className,
			)}
		>
			{Array.from({ length: lineCount }).map((_, index) => {
				const isActive = index < activeLines;
				return (
					<motion.div
						key={index.toString()}
						initial={false}
						animate={{
							backgroundColor: isActive
								?"var(--foreground)"
								:"var(--muted-foreground)",
							opacity: isActive ? 1 : 0.4,
							scaleY: isActive ? 1 : 0.7,
						}}
						transition={{
							type:"spring",
							stiffness: 300,
							damping: 30,
						}}
						className="w-px h-full"
					/>
				);
			})}
		</div>
	);
}

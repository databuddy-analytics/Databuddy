'use client';

import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import {
	motion,
	useMotionValue,
	useMotionValueEvent,
	useTransform,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const MAX_OVERFLOW = 30;

interface SliderProps {
	value?: number;
	onValueChange?: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	className?: string;
	leftIcon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	showValue?: boolean;
	disabled?: boolean;
}

export function Slider({
	value = 0,
	onValueChange,
	min = 0,
	max = 100,
	step = 1,
	className,
	leftIcon = <MinusIcon size={16} />,
	rightIcon = <PlusIcon size={16} />,
	showValue = true,
	disabled = false,
}: SliderProps) {
	const [internalValue, setInternalValue] = useState(value);
	const sliderRef = useRef<HTMLDivElement>(null);
	const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle');
	const [isDragging, setIsDragging] = useState(false);

	const clientX = useMotionValue(0);
	const overflow = useMotionValue(0);

	useEffect(() => {
		setInternalValue(value);
	}, [value]);

	useMotionValueEvent(clientX, 'change', (latest: number) => {
		if (sliderRef.current && isDragging) {
			const { left, right } = sliderRef.current.getBoundingClientRect();
			let newOverflow: number;

			if (latest < left) {
				setRegion('left');
				newOverflow = left - latest;
			} else if (latest > right) {
				setRegion('right');
				newOverflow = latest - right;
			} else {
				setRegion('middle');
				newOverflow = 0;
			}

			overflow.jump(decay(newOverflow, MAX_OVERFLOW));
		}
	});

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging || disabled || !sliderRef.current) {
			return;
		}

		const { left, width } = sliderRef.current.getBoundingClientRect();
		let newValue = min + ((e.clientX - left) / width) * (max - min);

		// Apply step
		if (step > 0) {
			newValue = Math.round(newValue / step) * step;
		}

		// Clamp to bounds
		newValue = Math.min(Math.max(newValue, min), max);

		setInternalValue(newValue);
		onValueChange?.(newValue);
		clientX.jump(e.clientX);
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled) {
			return;
		}

		setIsDragging(true);
		handlePointerMove(e);
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerUp = () => {
		setIsDragging(false);
		setRegion('middle');
		overflow.jump(0);
	};

	const getPercentage = (): number => {
		const range = max - min;
		if (range === 0) {
			return 0;
		}
		return ((internalValue - min) / range) * 100;
	};

	return (
		<div className={cn('space-y-3', className)}>
			<div
				className={cn(
					'flex items-center gap-4',
					disabled && 'cursor-not-allowed opacity-50'
				)}
			>
				{/* Left Icon */}
				<motion.div
					className="flex-shrink-0 text-muted-foreground"
					style={{
						x: useTransform(() =>
							region === 'left' ? -overflow.get() / 2 : 0
						),
						scale: region === 'left' ? 1.3 : 1,
					}}
				>
					{leftIcon}
				</motion.div>

				{/* Slider Track */}
				<div
					className={cn(
						'relative flex-1 cursor-pointer touch-none',
						disabled && 'cursor-not-allowed'
					)}
					onPointerDown={handlePointerDown}
					onPointerLeave={handlePointerUp}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					ref={sliderRef}
				>
					<motion.div
						className="relative"
						style={{
							scaleX: useTransform(() => {
								if (sliderRef.current) {
									const { width } = sliderRef.current.getBoundingClientRect();
									return 1 + overflow.get() / width;
								}
								return 1;
							}),
							scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.7]),
							transformOrigin: useTransform(() => {
								if (sliderRef.current) {
									const { left, width } =
										sliderRef.current.getBoundingClientRect();
									return clientX.get() < left + width / 2 ? 'right' : 'left';
								}
								return 'center';
							}),
						}}
					>
						{/* Track Background */}
						<div className="h-2 w-full rounded-full bg-secondary">
							{/* Progress */}
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${getPercentage()}%` }}
							/>
						</div>

						{/* Thumb */}
						<motion.div
							className="-translate-y-1/2 absolute top-1/2 h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm"
							style={{
								left: `${getPercentage()}%`,
								x: '-50%',
							}}
							whileHover={{ scale: 1.1 }}
							whileTap={{ scale: 0.95 }}
						/>
					</motion.div>
				</div>

				{/* Right Icon */}
				<motion.div
					className="flex-shrink-0 text-muted-foreground"
					style={{
						x: useTransform(() =>
							region === 'right' ? overflow.get() / 2 : 0
						),
						scale: region === 'right' ? 1.3 : 1,
					}}
				>
					{rightIcon}
				</motion.div>
			</div>

			{/* Value Display */}
			{showValue && (
				<div className="text-center">
					<span className="font-medium font-mono text-sm">
						{Math.round(internalValue)}
						{max === 100 && '%'}
					</span>
				</div>
			)}
		</div>
	);
}

// Decay function for smooth overflow animation
function decay(value: number, max: number): number {
	if (max === 0) {
		return 0;
	}
	const entry = value / max;
	const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
	return sigmoid * max;
}

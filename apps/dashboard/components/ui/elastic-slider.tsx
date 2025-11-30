'use client';

import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import {
	motion,
	useMotionValue,
	useMotionValueEvent,
	useTransform,
} from 'motion/react';
import { useCallback, useRef, useState } from 'react';
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

function decay(value: number, maxValue: number): number {
	if (maxValue === 0) return 0;
	const entry = value / maxValue;
	const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
	return sigmoid * maxValue;
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

	const percentage = ((internalValue - min) / (max - min || 1)) * 100;

	useMotionValueEvent(clientX, 'change', (latest: number) => {
		if (!sliderRef.current || !isDragging) return;

		const { left, right } = sliderRef.current.getBoundingClientRect();
		let newOverflow = 0;

		if (latest < left) {
			setRegion('left');
			newOverflow = left - latest;
		} else if (latest > right) {
			setRegion('right');
			newOverflow = latest - right;
		} else {
			setRegion('middle');
		}

		overflow.jump(decay(newOverflow, MAX_OVERFLOW));
	});

	const updateValue = useCallback(
		(clientXPos: number) => {
			if (!sliderRef.current) return;

			const { left, width } = sliderRef.current.getBoundingClientRect();
			let newValue = min + ((clientXPos - left) / width) * (max - min);

			if (step > 0) {
				newValue = Math.round(newValue / step) * step;
			}

			newValue = Math.min(Math.max(newValue, min), max);
			setInternalValue(newValue);
			onValueChange?.(newValue);
			clientX.jump(clientXPos);
		},
		[min, max, step, onValueChange, clientX]
	);

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (disabled) return;

		setIsDragging(true);
		updateValue(e.clientX);
		e.currentTarget.setPointerCapture(e.pointerId);
		document.body.style.cursor = 'grabbing';
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging || disabled) return;
		updateValue(e.clientX);
	};

	const handlePointerUp = () => {
		setIsDragging(false);
		setRegion('middle');
		overflow.jump(0);
		document.body.style.cursor = '';
	};

	return (
		<div className={cn('space-y-3', className)}>
			<div
				className={cn(
					'flex select-none items-center gap-4',
					disabled && 'cursor-not-allowed opacity-50'
				)}
			>
				<motion.div
					className="shrink-0 text-muted-foreground"
					style={{
						x: useTransform(() =>
							region === 'left' ? -overflow.get() / 2 : 0
						),
						scale: region === 'left' ? 1.3 : 1,
					}}
				>
					{leftIcon}
				</motion.div>

				<div
					ref={sliderRef}
					className={cn(
						'relative flex-1 touch-none',
						disabled ? 'cursor-not-allowed' : 'cursor-grab',
						isDragging && 'cursor-grabbing'
					)}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerLeave={handlePointerUp}
				>
					<motion.div
						className="relative"
						style={{
							scaleX: useTransform(() => {
								if (!sliderRef.current) return 1;
								const { width } = sliderRef.current.getBoundingClientRect();
								return 1 + overflow.get() / width;
							}),
							scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.7]),
							transformOrigin: useTransform(() => {
								if (!sliderRef.current) return 'center';
								const { left, width } =
									sliderRef.current.getBoundingClientRect();
								return clientX.get() < left + width / 2 ? 'right' : 'left';
							}),
						}}
					>
						<div className="h-2 w-full rounded-full bg-secondary">
							<div
								className="h-full rounded-full bg-primary transition-[width] duration-75"
								style={{ width: `${percentage}%` }}
							/>
						</div>

						<motion.div
							className={cn(
								'-translate-y-1/2 absolute top-1/2 size-4 rounded-full border-2 border-primary bg-background shadow-sm',
								isDragging ? 'cursor-grabbing' : 'cursor-grab'
							)}
							style={{ left: `${percentage}%`, x: '-50%' }}
							whileHover={{ scale: 1.1 }}
							whileTap={{ scale: 0.95 }}
						/>
					</motion.div>
				</div>

				<motion.div
					className="shrink-0 text-muted-foreground"
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

			{showValue && (
				<div className="text-center">
					<span className="font-medium font-mono text-sm tabular-nums">
						{Math.round(internalValue)}
						{max === 100 && '%'}
					</span>
				</div>
			)}
		</div>
	);
}

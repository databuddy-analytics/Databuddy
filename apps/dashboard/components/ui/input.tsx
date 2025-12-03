'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { forwardRef, useState } from 'react';

type InputProps = React.ComponentProps<'input'> & {
	variant?: 'default' | 'ghost';
	showFocusIndicator?: boolean;
	wrapperClassName?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
	(
		{
			className,
			type,
			variant = 'default',
			showFocusIndicator = true,
			wrapperClassName,
			onFocus,
			onBlur,
			...props
		},
		ref
	) => {
		const [isFocused, setIsFocused] = useState(false);

		const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
			setIsFocused(true);
			onFocus?.(e);
		};

		const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
			setIsFocused(false);
			onBlur?.(e);
		};

		// Extract border-radius related classes to apply to wrapper
		const hasRoundedLeft = className?.includes('rounded-l-none');
		const hasRoundedRight = className?.includes('rounded-r-none');

		return (
			<div
				className={cn(
					'relative flex-1 min-w-0',
					wrapperClassName
				)}
			>
				<input
					ref={ref}
					className={cn(
						'peer flex h-9 text-[13px] placeholder:text-[13px] w-full min-w-0 rounded border px-3 py-1 text-sm outline-none transition-all selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
						'bg-accent/40 dark:bg-input/30',
						'focus-visible:bg-background focus-visible:border-primary/50 focus-visible:blue-angled-rectangle-gradient',
						'aria-invalid:border-destructive aria-invalid:red-angled-rectangle-gradient',
						variant === 'ghost' &&
							'border-transparent bg-transparent hover:bg-accent/30 focus-visible:bg-accent/50',
						className
					)}
					data-slot="input"
					type={type}
					onFocus={handleFocus}
					onBlur={handleBlur}
					{...props}
				/>
				{/* Animated focus indicator line */}
				{showFocusIndicator && (
					<motion.span
						className={cn(
							'absolute bottom-0 h-[2px] bg-primary pointer-events-none',
							hasRoundedLeft ? 'left-0 rounded-r-full' : 'left-1 rounded-l-full',
							hasRoundedRight ? 'right-0 rounded-l-full' : 'right-1 rounded-r-full'
						)}
						initial={false}
						animate={{
							scaleX: isFocused ? 1 : 0,
							opacity: isFocused ? 1 : 0,
						}}
						transition={{
							type: 'spring',
							stiffness: 500,
							damping: 35,
						}}
						style={{ originX: 0.5 }}
					/>
				)}
			</div>
		);
	}
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };

'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { ComponentProps } from 'react';
import { forwardRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

type TextareaProps = ComponentProps<typeof TextareaAutosize> & {
	showFocusIndicator?: boolean;
	wrapperClassName?: string;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
	(
		{
			className,
			showFocusIndicator = true,
			wrapperClassName,
			onFocus,
			onBlur,
			...props
		},
		ref
	) => {
		const [isFocused, setIsFocused] = useState(false);
		const hasError = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

		const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
			setIsFocused(true);
			onFocus?.(e);
		};

		const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
			setIsFocused(false);
			onBlur?.(e);
		};

		return (
			<div className={cn('relative flex-1 min-w-0', wrapperClassName)}>
				<TextareaAutosize
					ref={ref}
					className={cn(
						'field-sizing-content flex min-h-16 w-full rounded-sm border border-accent-brighter px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
						'bg-input dark:bg-input/80',
						'focus-visible:bg-background focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:blue-angled-rectangle-gradient',
						'aria-invalid:border-destructive/60 aria-invalid:bg-destructive/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:bg-destructive/10',
						'aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/30',
						className
					)}
					data-slot="textarea"
					onFocus={handleFocus}
					onBlur={handleBlur}
					{...props}
				/>
				{showFocusIndicator && (
					<motion.span
						className={cn(
							'absolute bottom-0 left-1 right-1 h-[2px] pointer-events-none rounded-full',
							hasError ? 'bg-destructive' : 'bg-brand-purple'
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

Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };

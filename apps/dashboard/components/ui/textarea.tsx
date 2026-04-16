"use client";

import type { ComponentProps } from "react";
import { forwardRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils";

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
		const hasError =
			props["aria-invalid"] === true || props["aria-invalid"] === "true";

		const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
			setIsFocused(true);
			onFocus?.(e);
		};

		const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
			setIsFocused(false);
			onBlur?.(e);
		};

		return (
			<div className={cn("relative min-w-0 flex-1", wrapperClassName)}>
				<TextareaAutosize
					className={cn(
						"field-sizing-content flex min-h-16 w-full rounded-sm border border-accent-brighter px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
						"bg-input dark:bg-input/80",
						"focus-visible:blue-angled-rectangle-gradient focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"aria-invalid:border-destructive/60 aria-invalid:bg-destructive/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:bg-destructive/10",
						"aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/30",
						className
					)}
					data-slot="textarea"
					onBlur={handleBlur}
					onFocus={handleFocus}
					ref={ref}
					{...props}
				/>
				{showFocusIndicator && (
					<span
						className={cn(
							"pointer-events-none absolute right-1 bottom-0 left-1 h-[2px] origin-center rounded-full transition-[transform,opacity] duration-200 ease-out",
							hasError ? "bg-destructive" : "bg-brand-purple",
							isFocused ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
						)}
					/>
				)}
			</div>
		);
	}
);

Textarea.displayName = "Textarea";

export type { TextareaProps };
export { Textarea };

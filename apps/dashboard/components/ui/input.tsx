"use client";

import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

type InputProps = Omit<React.ComponentProps<"input">, "prefix" | "suffix"> & {
	variant?: "default" | "ghost";
	showFocusIndicator?: boolean;
	wrapperClassName?: string;
	prefix?: React.ReactNode;
	suffix?: React.ReactNode;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
	(
		{
			className,
			type,
			variant = "default",
			showFocusIndicator = true,
			wrapperClassName,
			prefix,
			suffix,
			onFocus,
			onBlur,
			...props
		},
		ref
	) => {
		const [isFocused, setIsFocused] = useState(false);
		const hasError =
			props["aria-invalid"] === true || props["aria-invalid"] === "true";

		const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
			setIsFocused(true);
			onFocus?.(e);
		};

		const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
			setIsFocused(false);
			onBlur?.(e);
		};

		const hasPrefix = !!prefix;
		const hasSuffix = !!suffix;

		const isSmallHeight = className?.includes("h-8");
		const heightClass = isSmallHeight ? "h-8" : "h-9";

		if (hasPrefix || hasSuffix) {
			return (
				<div
					className={cn(
						"group relative flex min-w-0 flex-1 items-stretch rounded border border-accent-brighter bg-background transition-colors dark:bg-background",
						"focus-within:border-ring",
						"has-[input[aria-invalid=true]]:border-destructive/60",
						"has-[input[aria-invalid=true]]:focus-within:border-destructive",
						wrapperClassName
					)}
				>
					{hasPrefix && (
						<span
							className={cn(
								"inline-flex shrink-0 select-none items-center rounded-l border-accent-brighter border-r bg-muted/40 px-3 text-muted-foreground text-sm",
								heightClass
							)}
						>
							{prefix}
						</span>
					)}
					<input
						className={cn(
							"peer flex h-9 min-w-0 flex-1 cursor-text border-none bg-transparent px-3 py-1 text-[13px] text-sm outline-none transition-colors selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-[13px] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
							variant === "ghost" &&
								"hover:bg-accent/30 focus-visible:bg-accent/50",
							className
						)}
						data-slot="input"
						onBlur={handleBlur}
						onFocus={handleFocus}
						ref={ref}
						type={type}
						{...props}
					/>
					{hasSuffix && (
						<span
							className={cn(
								"inline-flex shrink-0 select-none items-center rounded-r border-accent-brighter border-l bg-muted/40 px-3 text-muted-foreground text-sm",
								heightClass
							)}
						>
							{suffix}
						</span>
					)}
					{showFocusIndicator && (
						<span
							className={cn(
								"pointer-events-none absolute inset-x-1 bottom-0 h-[2px] origin-center rounded-full transition-[transform,opacity] duration-200 ease-out",
								hasError ? "bg-destructive" : "bg-brand-purple",
								isFocused ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
							)}
						/>
					)}
				</div>
			);
		}

		return (
			<div className={cn("relative min-w-0 flex-1", wrapperClassName)}>
				<input
					className={cn(
						"peer flex h-9 w-full min-w-0 cursor-text rounded border border-accent-brighter bg-background px-3 py-1 text-[13px] text-sm outline-none transition-colors selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-[13px] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
						"focus-visible:border-ring",
						"aria-invalid:border-destructive/60 aria-invalid:focus-visible:border-destructive",
						variant === "ghost" &&
							"border-transparent bg-transparent hover:bg-accent/30 focus-visible:bg-accent/50",
						className
					)}
					data-slot="input"
					onBlur={handleBlur}
					onFocus={handleFocus}
					ref={ref}
					type={type}
					{...props}
				/>
				{showFocusIndicator && (
					<span
						className={cn(
							"pointer-events-none absolute inset-x-1 bottom-0 h-[2px] origin-center rounded-full transition-[transform,opacity] duration-200 ease-out",
							hasError ? "bg-destructive" : "bg-brand-purple",
							isFocused ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
						)}
					/>
				)}
			</div>
		);
	}
);

Input.displayName = "Input";

export type { InputProps };
export { Input };

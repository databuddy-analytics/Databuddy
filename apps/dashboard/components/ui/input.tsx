"use client";

import { cn } from"@/lib/utils";
import { motion } from"framer-motion";
import { forwardRef, useState } from"react";

type InputProps = React.ComponentProps<"input"> & {
 variant?:"default" |"ghost";
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
 variant ="default",
 showFocusIndicator = true,
 wrapperClassName,
 prefix,
 suffix,
 onFocus,
 onBlur,
 ...props
 },
 ref,
 ) => {
 const [isFocused, setIsFocused] = useState(false);
 const hasError =
 props["aria-invalid"] === true || props["aria-invalid"] ==="true";

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
 const heightClass = isSmallHeight ?"h-8" :"h-9";

 if (hasPrefix || hasSuffix) {
 return (
 <div
 className={cn("flex min-w-0 flex-1 items-center", wrapperClassName)}
 >
 {hasPrefix && (
 <span
 className={cn(
"inline-flex shrink-0 items-center border border-r-0 bg-dialog px-3 text-muted-foreground text-sm",
 heightClass,
 )}
 >
 {prefix}
 </span>
 )}
 <div className="relative min-w-0 flex-1">
 <input
 ref={ref}
 className={cn(
"peer flex h-9 w-full min-w-0 cursor-text border border-accent-brighter px-3 py-1 text-[13px] text-sm outline-none transition-all placeholder:text-[13px] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
"bg-input dark:bg-input/80",
"focus-visible:blue-angled-rectangle-gradient focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
"aria-invalid:border-destructive/60 aria-invalid:bg-destructive/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:bg-destructive/10",
"aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/30",
 variant ==="ghost" &&
"border-transparent bg-transparent hover:bg-accent/30 focus-visible:bg-accent/50",
 hasPrefix &&" border-l-0",
 hasSuffix &&" border-r-0",
 !hasPrefix && !hasSuffix &&"",
 hasPrefix && !hasSuffix &&"",
 !hasPrefix && hasSuffix &&"",
 className,
 )}
 data-slot="input"
 onBlur={handleBlur}
 onFocus={handleFocus}
 type={type}
 {...props}
 />
 {showFocusIndicator && (
 <motion.span
 animate={{
 scaleX: isFocused ? 1 : 0,
 opacity: isFocused ? 1 : 0,
 }}
 className={cn(
"pointer-events-none absolute bottom-0 left-1 right-1 h-[2px]",
 hasError ?"bg-destructive" :"bg-primary",
 )}
 initial={false}
 style={{ originX: 0.5 }}
 transition={{
 type:"spring",
 stiffness: 500,
 damping: 35,
 }}
 />
 )}
 </div>
 {hasSuffix && (
 <span
 className={cn(
"inline-flex shrink-0 items-center border border-l-0 bg-dialog px-3 text-muted-foreground text-sm",
 heightClass,
 )}
 >
 {suffix}
 </span>
 )}
 </div>
 );
 }

 // Original behavior without prefix/suffix
 const hasRoundedLeft = className?.includes("");
 const hasRoundedRight = className?.includes("");

		return (
			<div className={cn("relative min-w-0 flex-1", wrapperClassName)}>
				<input
					ref={ref}
					className={cn(
						"peer flex h-9 w-full min-w-0 cursor-text border border-accent-brighter px-3 py-1 text-[13px] text-sm outline-none transition-all placeholder:text-[13px] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
						"bg-input dark:bg-input/80",
						"focus-visible:blue-angled-rectangle-gradient focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"aria-invalid:border-destructive/60 aria-invalid:bg-destructive/5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:bg-destructive/10",
						"aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/30",
						variant ==="ghost" &&
							"border-transparent bg-transparent hover:bg-accent/30 focus-visible:bg-accent/50",
						className
					)}
					data-slot="input"
					onBlur={handleBlur}
					onFocus={handleFocus}
					type={type}
					{...props}
				/>
				{showFocusIndicator && (
					<motion.span
						animate={{
							scaleX: isFocused ? 1 : 0,
							opacity: isFocused ? 1 : 0,
						}}
						className={cn(
							"pointer-events-none absolute bottom-0 h-[2px]",
							hasError ?"bg-destructive" :"bg-primary",
							hasRoundedLeft ?"left-0-r-full" :"left-1-l-full",
							hasRoundedRight ?"right-0-l-full" :"right-1-r-full"
						)}
						initial={false}
						style={{ originX: 0.5 }}
						transition={{
							type:"spring",
							stiffness: 500,
							damping: 35,
						}}
					/>
				)}
			</div>
		);
	}
);

Input.displayName ="Input";

export { Input };
export type { InputProps };

"use client";

import type { Ref } from "react";
import { cn } from "../lib/utils";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";

type OtpInputProps = Omit<
	React.ComponentPropsWithoutRef<typeof OTPInput>,
	"maxLength" | "render" | "children"
> & {
	length?: number;
};

export const OtpInput = function OtpInput({
	length = 6,
	className,
	ref,
	...rest
}: OtpInputProps & { ref?: Ref<HTMLInputElement> }) {
	return (
		<OTPInput
			containerClassName={cn(
				"flex w-full items-center justify-center gap-2",
				className
			)}
			inputMode="numeric"
			maxLength={length}
			pattern={REGEXP_ONLY_DIGITS}
			ref={ref}
			render={({ slots }) => (
				<>
					{slots.map((slot, i) => (
						<div
							className={cn(
								"relative flex size-11 items-center justify-center rounded-md bg-secondary text-foreground text-sm tabular-nums",
								"transition-all duration-(--duration-quick) ease-(--ease-smooth)",
								"disabled:cursor-not-allowed disabled:opacity-50",
								slot.isActive
									? "ring-2 ring-ring/60"
									: slot.char
										? "ring-1 ring-border"
										: ""
							)}
							key={i}
						>
							{slot.char ??
								(slot.hasFakeCaret ? (
									<span className="pointer-events-none absolute inset-0 flex items-center justify-center">
										<span className="h-4 w-px animate-caret-blink bg-foreground" />
									</span>
								) : null)}
						</div>
					))}
				</>
			)}
			{...rest}
		/>
	);
};

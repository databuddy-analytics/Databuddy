"use client";

import type { ComponentProps, Ref } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "../lib/utils";
import { useFieldContext } from "./field";

type TextareaProps = ComponentProps<typeof TextareaAutosize> & {
	showFocusIndicator?: boolean;
	wrapperClassName?: string;
};

export const Textarea = function Textarea({
	className,
	id,
	showFocusIndicator: _showFocusIndicator = true,
	wrapperClassName,
	ref,
	...rest
}: TextareaProps & { ref?: Ref<HTMLTextAreaElement> }) {
	const field = useFieldContext();

	return (
		<div className={cn("relative min-w-0 flex-1", wrapperClassName)}>
			<TextareaAutosize
				aria-describedby={
					rest["aria-describedby"] ??
					(field
						? [field.error && field.errorId, field.descriptionId]
								.filter(Boolean)
								.join(" ") || undefined
						: undefined)
				}
				aria-invalid={(rest["aria-invalid"] ?? field?.error) || undefined}
				className={cn(
					"flex min-h-20 w-full resize-y rounded-md bg-secondary px-3 py-2 text-foreground text-xs",
					"placeholder:text-muted-foreground",
					"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"disabled:cursor-not-allowed disabled:opacity-50",
					field?.error &&
						"ring-2 ring-destructive/60 focus-visible:ring-destructive/60",
					className
				)}
				id={id ?? field?.id}
				ref={ref}
				{...rest}
			/>
		</div>
	);
};

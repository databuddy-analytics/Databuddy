"use client";

import {
	createContext,
	type HTMLAttributes,
	type LabelHTMLAttributes,
	useContext,
	useId,
	useMemo,
} from "react";
import { cn } from "../lib/utils";

interface FieldContextValue {
	descriptionId: string;
	error: boolean;
	errorId: string;
	id: string;
}

const FieldCtx = createContext<FieldContextValue | null>(null);

export function useFieldContext() {
	return useContext(FieldCtx);
}

type RootProps = HTMLAttributes<HTMLDivElement> & {
	error?: boolean;
};

function Root({ className, error = false, ...rest }: RootProps) {
	const autoId = useId();
	const ctx = useMemo<FieldContextValue>(
		() => ({
			id: autoId,
			descriptionId: `${autoId}-desc`,
			errorId: `${autoId}-error`,
			error,
		}),
		[autoId, error]
	);

	return (
		<FieldCtx.Provider value={ctx}>
			<div className={cn("flex flex-col gap-1.5", className)} {...rest} />
		</FieldCtx.Provider>
	);
}

function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
	const field = useContext(FieldCtx);
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: htmlFor binds to the id supplied by the Field provider
		<label
			className={cn(
				"cursor-pointer select-none font-medium text-foreground text-xs",
				className
			)}
			htmlFor={field?.id}
			{...rest}
		/>
	);
}

function Description({
	className,
	...rest
}: HTMLAttributes<HTMLParagraphElement>) {
	const field = useContext(FieldCtx);
	return (
		<p
			className={cn("text-[11px] text-muted-foreground", className)}
			id={field?.descriptionId}
			{...rest}
		/>
	);
}

function ErrorMessage({
	className,
	...rest
}: HTMLAttributes<HTMLParagraphElement>) {
	const field = useContext(FieldCtx);
	return (
		<p
			className={cn("text-[11px] text-destructive", className)}
			id={field?.errorId}
			role="alert"
			{...rest}
		/>
	);
}

export const Field = Object.assign(Root, {
	Label,
	Description,
	Error: ErrorMessage,
});

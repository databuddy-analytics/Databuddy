"use client";

import { useFieldContext } from "@/components/ds/field";
import { cn } from "@/lib/utils";
import {
	Autocomplete as BaseAutocomplete,
	type AutocompleteRootProps,
} from "@base-ui-components/react/autocomplete";
import {
	forwardRef,
	type ComponentPropsWithoutRef,
	type ComponentPropsWithRef,
} from "react";

function Root<T>(props: AutocompleteRootProps<T> & { items?: readonly T[] }) {
	return <BaseAutocomplete.Root {...props} />;
}

const Input = forwardRef<
	HTMLInputElement,
	ComponentPropsWithRef<typeof BaseAutocomplete.Input>
>(({ className, id, ...rest }, ref) => {
	const field = useFieldContext();
	return (
		<BaseAutocomplete.Input
			aria-describedby={
				field
					? [field.error && field.errorId, field.descriptionId]
							.filter(Boolean)
							.join(" ") || undefined
					: undefined
			}
			aria-invalid={field?.error || undefined}
			className={cn(
				"flex h-8 w-full rounded-md bg-secondary px-3 text-foreground text-xs",
				"placeholder:text-muted-foreground",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				"disabled:cursor-not-allowed disabled:opacity-50",
				field?.error &&
					"ring-2 ring-destructive/60 focus-within:ring-destructive/60",
				className
			)}
			id={id ?? field?.id}
			ref={ref}
			{...rest}
		/>
	);
});
Input.displayName = "Autocomplete.Input";

type ContentProps = ComponentPropsWithoutRef<typeof BaseAutocomplete.Popup> & {
	side?: ComponentPropsWithoutRef<typeof BaseAutocomplete.Positioner>["side"];
	sideOffset?: ComponentPropsWithoutRef<
		typeof BaseAutocomplete.Positioner
	>["sideOffset"];
};

function Content({
	className,
	children,
	side = "bottom",
	sideOffset = 4,
	...rest
}: ContentProps) {
	return (
		<BaseAutocomplete.Portal>
			<BaseAutocomplete.Positioner
				className="z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<BaseAutocomplete.Popup
					className={cn(
						"max-h-60 w-[var(--anchor-width)] min-w-[200px] overflow-y-auto rounded-md border border-border/60 bg-popover shadow-lg",
						"origin-(--transform-origin)",
						"data-open:fade-in data-open:zoom-in-95 data-open:animate-in data-open:duration-150",
						"not-data-open:fade-out not-data-open:zoom-out-95 not-data-open:animate-out not-data-open:duration-100",
						className
					)}
					{...rest}
				>
					<BaseAutocomplete.List>{children}</BaseAutocomplete.List>
				</BaseAutocomplete.Popup>
			</BaseAutocomplete.Positioner>
		</BaseAutocomplete.Portal>
	);
}

function Item({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseAutocomplete.Item>) {
	return (
		<BaseAutocomplete.Item
			className={cn(
				"flex cursor-pointer select-none items-center gap-2 border-border/40 border-b px-3 py-2 text-foreground text-xs outline-none last:border-b-0",
				"wrap-break-words",
				"data-highlighted:bg-interactive-hover data-highlighted:text-foreground",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				className
			)}
			{...rest}
		/>
	);
}

function Empty({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseAutocomplete.Empty>) {
	return (
		<BaseAutocomplete.Empty
			className={cn("px-3 py-2 text-muted-foreground text-xs", className)}
			{...rest}
		/>
	);
}

export const Autocomplete = Object.assign(Root, {
	Input,
	Content,
	Item,
	Empty,
}) as typeof Root & {
	Input: typeof Input;
	Content: typeof Content;
	Item: typeof Item;
	Empty: typeof Empty;
};

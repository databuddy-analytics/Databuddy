"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import type * as React from "react";

import { cn } from "@/lib/utils";
import {
	CaretDownIcon,
	CaretUpIcon,
	CheckIcon,
} from "@databuddy/ui/icons";
import { useFieldContext } from "@databuddy/ui";

function Select({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
	return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
	return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
	size?: "sm" | "default";
}) {
	const field = useFieldContext();
	const hasError =
		field?.error ||
		props["aria-invalid"] === true ||
		props["aria-invalid"] === "true";

	return (
		<SelectPrimitive.Trigger
			aria-describedby={
				props["aria-describedby"] ??
				(field
					? [field.error && field.errorId, field.descriptionId]
							.filter(Boolean)
							.join(" ") || undefined
					: undefined)
			}
			className={cn(
				"flex w-fit cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-md bg-secondary px-3 py-2 outline-none",
				"transition-[color,box-shadow,background-color] duration-(--duration-quick) ease-(--ease-smooth)",
				"focus-visible:ring-2 focus-visible:ring-ring/60",
				"disabled:pointer-events-none disabled:opacity-50",
				hasError && "ring-2 ring-destructive/60 focus-visible:ring-destructive/60",
				"data-[size=default]:h-9 data-[size=sm]:h-8",
				"data-[placeholder]:text-muted-foreground",
				"text-xs *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
				"[&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			data-size={size}
			data-slot="select-trigger"
			id={props.id ?? field?.id}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<CaretDownIcon className="size-4 opacity-50" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({
	className,
	children,
	position = "popper",
	...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				className={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
					"relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin)",
					"overflow-y-auto overflow-x-hidden rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in",
					position === "popper" &&
						"data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
					className
				)}
				data-slot="select-content"
				position={position}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport
					className={cn(
						"p-1",
						position === "popper" &&
							"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
	return (
		<SelectPrimitive.Label
			className={cn("px-2.5 py-1.5 font-medium text-[11px] text-muted-foreground", className)}
			data-slot="select-label"
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"relative flex h-8 w-full cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-[13px] text-foreground outline-hidden transition-colors",
				"focus:bg-interactive-hover focus:text-foreground",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				"[&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className
			)}
			data-slot="select-item"
			{...props}
		>
			<span className="absolute right-2 flex size-3.5 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
	return (
		<SelectPrimitive.Separator
			className={cn("pointer-events-none -mx-1 my-0.5 h-px bg-border/60", className)}
			data-slot="select-separator"
			{...props}
		/>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
	return (
		<SelectPrimitive.ScrollUpButton
			className={cn(
				"flex cursor-default items-center justify-center py-1",
				className
			)}
			data-slot="select-scroll-up-button"
			{...props}
		>
			<CaretUpIcon className="size-4" />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
	return (
		<SelectPrimitive.ScrollDownButton
			className={cn(
				"flex cursor-default items-center justify-center py-1",
				className
			)}
			data-slot="select-scroll-down-button"
			{...props}
		>
			<CaretDownIcon className="size-4" />
		</SelectPrimitive.ScrollDownButton>
	);
}

export {
	Select,
	SelectContent,
	
	SelectItem,
	
	
	
	
	SelectTrigger,
	SelectValue,
};

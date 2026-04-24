"use client";

import { cn } from "@/lib/utils";
import { Menu as BaseMenu } from "@base-ui-components/react/menu";
import type { ComponentPropsWithoutRef } from "react";

function Root(props: ComponentPropsWithoutRef<typeof BaseMenu.Root>) {
	return <BaseMenu.Root {...props} />;
}

function Trigger({
	children,
	render,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.Trigger>) {
	return (
		<BaseMenu.Trigger render={render} {...rest}>
			{children}
		</BaseMenu.Trigger>
	);
}

function Content({
	className,
	children,
	side = "bottom",
	align = "end",
	sideOffset = 4,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.Popup> & {
	side?: ComponentPropsWithoutRef<typeof BaseMenu.Positioner>["side"];
	align?: ComponentPropsWithoutRef<typeof BaseMenu.Positioner>["align"];
	sideOffset?: number;
}) {
	return (
		<BaseMenu.Portal>
			<BaseMenu.Positioner
				align={align}
				className="z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<BaseMenu.Popup
					className={cn(
						"min-w-44 overflow-hidden rounded-lg border border-border/60 bg-popover p-1",
						"origin-(--transform-origin)",
						"motion-reduce:transition-none",
						"data-open:fade-in data-open:zoom-in-95 data-open:animate-in data-open:duration-150",
						"not-data-open:fade-out not-data-open:zoom-out-95 not-data-open:animate-out not-data-open:duration-100",
						className
					)}
					{...rest}
				>
					{children}
				</BaseMenu.Popup>
			</BaseMenu.Positioner>
		</BaseMenu.Portal>
	);
}

function Item({
	className,
	variant,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.Item> & {
	variant?: "default" | "destructive";
}) {
	return (
		<BaseMenu.Item
			className={cn(
				"flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] outline-none",
				"data-highlighted:bg-interactive-hover",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				variant === "destructive"
					? "text-destructive data-highlighted:text-destructive"
					: "text-foreground",
				className
			)}
			{...rest}
		/>
	);
}

function Separator({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.Separator>) {
	return (
		<BaseMenu.Separator
			className={cn("my-0.5 h-px bg-border/60", className)}
			{...rest}
		/>
	);
}

function Group(props: ComponentPropsWithoutRef<typeof BaseMenu.Group>) {
	return <BaseMenu.Group {...props} />;
}

function GroupLabel({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.GroupLabel>) {
	return (
		<BaseMenu.GroupLabel
			className={cn(
				"px-2.5 py-1.5 font-medium text-[11px] text-muted-foreground",
				className
			)}
			{...rest}
		/>
	);
}

function CheckboxItem({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.CheckboxItem>) {
	return (
		<BaseMenu.CheckboxItem
			className={cn(
				"flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-foreground outline-none",
				"data-highlighted:bg-interactive-hover",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				className
			)}
			{...rest}
		/>
	);
}

function RadioGroup(
	props: ComponentPropsWithoutRef<typeof BaseMenu.RadioGroup>
) {
	return <BaseMenu.RadioGroup {...props} />;
}

function RadioItem({
	className,
	closeOnClick = true,
	...rest
}: ComponentPropsWithoutRef<typeof BaseMenu.RadioItem>) {
	return (
		<BaseMenu.RadioItem
			className={cn(
				"flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-[13px] text-foreground outline-none",
				"data-highlighted:bg-interactive-hover",
				"data-disabled:pointer-events-none data-disabled:opacity-50",
				className
			)}
			closeOnClick={closeOnClick}
			{...rest}
		/>
	);
}

export const DropdownMenu = Object.assign(Root, {
	Trigger,
	Content,
	Item,
	Separator,
	Group,
	GroupLabel,
	CheckboxItem,
	RadioGroup,
	RadioItem,
});

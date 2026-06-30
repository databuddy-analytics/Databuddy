"use client";

import { cn } from "../lib/utils";
import { Tabs as BaseTabs } from "@base-ui-components/react/tabs";
import type { ComponentPropsWithoutRef } from "react";

function Root({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Root>) {
	return <BaseTabs.Root className={cn("flex flex-col", className)} {...rest} />;
}

function List({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.List>) {
	return (
		<BaseTabs.List
			className={cn(
				"relative inline-flex h-9 w-fit items-center gap-0.5 border-b border-accent-foreground/10",
				className,
			)}
			{...rest}
		/>
	);
}

function Tab({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Tab>) {
	return (
		<BaseTabs.Tab
			className={cn(
				"relative inline-flex h-full cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap px-3 font-medium text-muted-foreground text-sm",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				"hover:text-foreground",
				"data-active:text-foreground",
				"after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-(--duration-quick) after:ease-(--ease-smooth)",
				"data-active:after:scale-x-100",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:rounded-sm",
				"disabled:pointer-events-none disabled:opacity-50",
				"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...rest}
		/>
	);
}

function Panel({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Panel>) {
	return (
		<BaseTabs.Panel
			className={cn("focus-visible:outline-none", className)}
			{...rest}
		/>
	);
}

function Indicator({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseTabs.Indicator>) {
	return (
		<BaseTabs.Indicator
			className={cn(
				"absolute bottom-0 h-0.5 rounded-full bg-primary",
				"transition-[width,transform] duration-(--duration-quick) ease-(--ease-smooth)",
				"motion-reduce:transition-none",
				className,
			)}
			{...rest}
		/>
	);
}

export const Tabs = Object.assign(Root, {
	List,
	Tab,
	Panel,
	Indicator,
});

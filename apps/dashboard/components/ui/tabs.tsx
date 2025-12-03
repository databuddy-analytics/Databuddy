"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import {
	createContext,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type TabsVariant = "default" | "underline" | "pills";

const TabsContext = createContext<{
	variant: TabsVariant;
	registerTrigger: (value: string, element: HTMLButtonElement | null) => void;
	activeValue: string | undefined;
}>({
	variant: "default",
	registerTrigger: () => {},
	activeValue: undefined,
});

function Tabs({
	className,
	variant = "default",
	defaultValue,
	value,
	onValueChange,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
	variant?: TabsVariant;
}) {
	const [activeValue, setActiveValue] = useState(value ?? defaultValue);
	const triggersRef = useRef<Map<string, HTMLButtonElement>>(new Map());

	const registerTrigger = (val: string, element: HTMLButtonElement | null) => {
		if (element) {
			triggersRef.current.set(val, element);
		} else {
			triggersRef.current.delete(val);
		}
	};

	const handleValueChange = (newValue: string) => {
		setActiveValue(newValue);
		onValueChange?.(newValue);
	};

	return (
		<TabsContext.Provider value={{ variant, registerTrigger, activeValue }}>
			<TabsPrimitive.Root
				className={cn("flex flex-col gap-2", className)}
				data-slot="tabs"
				data-variant={variant}
				defaultValue={defaultValue}
				onValueChange={handleValueChange}
				value={value}
				{...props}
			/>
		</TabsContext.Provider>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	const { variant, activeValue } = useContext(TabsContext);
	const listRef = useRef<HTMLDivElement>(null);
	const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

	useLayoutEffect(() => {
		if (variant !== "underline" || !listRef.current || !activeValue) return;

		const activeTab = listRef.current.querySelector(
			`[data-state="active"]`
		) as HTMLElement;

		if (activeTab) {
			const listRect = listRef.current.getBoundingClientRect();
			const tabRect = activeTab.getBoundingClientRect();

			setIndicatorStyle({
				width: tabRect.width,
				transform: `translateX(${tabRect.left - listRect.left}px)`,
			});
		}
	}, [activeValue, variant]);

	if (variant === "underline") {
		return (
			<div className="relative border-b">
				<TabsPrimitive.List
					className={cn(
						"relative flex h-10 w-full bg-transparent",
						className
					)}
					data-slot="tabs-list"
					ref={listRef}
					{...props}
				/>
				<div
					className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-200 ease-out"
					style={indicatorStyle}
				/>
			</div>
		);
	}

	if (variant === "pills") {
		return (
			<TabsPrimitive.List
				className={cn(
					"inline-flex h-9 w-fit items-center gap-1 rounded bg-accent p-1 text-muted-foreground",
					className
				)}
				data-slot="tabs-list"
				ref={listRef}
				{...props}
			/>
		);
	}

	// Default variant
	return (
		<TabsPrimitive.List
			className={cn(
				"inline-flex h-9 w-fit items-center justify-center rounded bg-accent-brighter p-[3px] text-muted-foreground",
				className
			)}
			data-slot="tabs-list"
			ref={listRef}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	value,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	const { variant, registerTrigger } = useContext(TabsContext);
	const triggerRef = useRef<HTMLButtonElement>(null);

	useLayoutEffect(() => {
		if (value) {
			registerTrigger(value, triggerRef.current);
		}
		return () => {
			if (value) {
				registerTrigger(value, null);
			}
		};
	}, [value, registerTrigger]);

	if (variant === "underline") {
		return (
			<TabsPrimitive.Trigger
				className={cn(
					"relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 bg-transparent px-3 py-2",
					"font-medium text-muted-foreground text-sm transition-colors",
					"hover:text-foreground",
					"data-[state=active]:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					"disabled:pointer-events-none disabled:opacity-50",
					"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					className
				)}
				data-slot="tabs-trigger"
				ref={triggerRef}
				value={value}
				{...props}
			/>
		);
	}

	if (variant === "pills") {
		return (
			<TabsPrimitive.Trigger
				className={cn(
					"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5",
					"font-medium text-muted-foreground text-sm transition-all duration-200",
					"hover:text-foreground",
					"data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"disabled:pointer-events-none disabled:opacity-50",
					"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					className
				)}
				data-slot="tabs-trigger"
				ref={triggerRef}
				value={value}
				{...props}
			/>
		);
	}

	// Default variant
	return (
		<TabsPrimitive.Trigger
			className={cn(
				"inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1",
				"font-medium text-muted data-[state=active]:text-foreground text-sm transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px]",
				"focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-accent-foreground/10",
				"data-[state=active]:bg-secondary-brightest [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			data-slot="tabs-trigger"
			ref={triggerRef}
			value={value}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			className={cn("flex-1 outline-none", className)}
			data-slot="tabs-content"
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

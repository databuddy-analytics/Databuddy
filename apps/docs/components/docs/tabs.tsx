"use client";

import { cn } from "@databuddy/ui";
import { Tabs as UITabs } from "@databuddy/ui/client";
import React from "react";
import { docsSurface } from "@/components/docs/docs-styles";

interface TabsProps extends React.ComponentProps<typeof UITabs> {
	items?: string[];
}

function Tabs({ className, items, children, ...props }: TabsProps) {
	const defaultValue = props.defaultValue || (items ? items[0] : undefined);

	if (items && Array.isArray(children)) {
		const tabsContent = React.Children.toArray(children);

		return (
			<UITabs
				className={cn("my-4 w-full", className)}
				defaultValue={defaultValue}
				{...props}
			>
				<TabsList>
					{items.map((item) => (
						<TabsTrigger key={item} value={item}>
							{item}
						</TabsTrigger>
					))}
				</TabsList>
				{tabsContent.map((content, index) => {
					if (React.isValidElement(content) && content.type === Tab) {
						const tabProps = content.props as TabProps;
						return (
							<TabsContent
								key={items[index]}
								value={tabProps.value || items[index]}
							>
								{tabProps.children}
							</TabsContent>
						);
					}
					return content;
				})}
			</UITabs>
		);
	}

	return (
		<UITabs
			className={cn("my-4 w-full", className)}
			defaultValue={defaultValue}
			{...props}
		>
			{children}
		</UITabs>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof UITabs.List>) {
	return (
		<UITabs.List
			className={cn(
				"mb-3 w-fit rounded border border-sidebar-border/50 bg-sidebar-accent/45 p-0.5",
				className
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof UITabs.Tab>) {
	return (
		<UITabs.Tab
			className={cn(
				"h-8 rounded px-2.5 after:hidden data-active:bg-sidebar data-active:text-sidebar-foreground",
				className
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof UITabs.Panel>) {
	return (
		<UITabs.Panel
			className={cn(
				docsSurface,
				"p-4 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
				className
			)}
			{...props}
		/>
	);
}

interface TabProps {
	children: React.ReactNode;
	value?: string;
}

function Tab({ children }: TabProps) {
	return <>{children}</>;
}

export { Tab, Tabs, TabsContent, TabsList, TabsTrigger };

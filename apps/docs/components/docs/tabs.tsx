import React from "react";
import { SciFiCard } from "@/components/scifi-card";
import {
	Tabs as BaseTabs,
	TabsList as BaseTabsList,
	TabsTrigger as BaseTabsTrigger,
	TabsContent,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface TabsProps extends React.ComponentProps<typeof BaseTabs> {
	items?: string[];
}

function Tabs({ className, items, children, ...props }: TabsProps) {
	const defaultValue = props.defaultValue || (items ? items[0] : undefined);

	if (items && Array.isArray(children)) {
		const tabsContent = React.Children.toArray(children);

		return (
			<BaseTabs
				className={cn("w-full", className)}
				defaultValue={defaultValue}
				{...props}
			>
				<TabsList
					className="grid w-full"
					style={{
						gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
					}}
				>
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
			</BaseTabs>
		);
	}

	return (
		<BaseTabs
			className={cn("w-full", className)}
			defaultValue={defaultValue}
			{...props}
		>
			{children}
		</BaseTabs>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof BaseTabsList>) {
	return (
		<SciFiCard
			className={cn(
				"inline-flex h-12 w-fit items-center justify-center rounded-none border border-border bg-card/50 p-1.5 backdrop-blur-sm",
				className
			)}
			opacity="reduced"
			size="sm"
		>
			<BaseTabsList
				className="inline-flex h-full w-full items-center justify-center gap-1"
				{...props}
			/>
		</SciFiCard>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof BaseTabsTrigger>) {
	return (
		<BaseTabsTrigger
			className={cn(
				"relative inline-flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-none px-4 py-1 font-medium text-muted-foreground text-sm transition-all duration-200",
				"hover:bg-foreground/5 hover:text-foreground",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"data-[state=active]:bg-primary/10 data-[state=active]:text-primary",
				"data-[state=active]:border data-[state=active]:border-primary/20",
				"border border-transparent",
				className
			)}
			{...props}
		/>
	);
}

type TabProps = {
	value?: string;
	children: React.ReactNode;
};

function Tab({ children }: TabProps) {
	return <>{children}</>;
}

export { Tabs, Tab, TabsList, TabsTrigger, TabsContent };

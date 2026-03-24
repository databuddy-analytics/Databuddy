import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import React from "react";
import { cn } from "@/lib/utils";

interface TabsProps extends React.ComponentProps<typeof Root> {
	items?: string[];
}

function Tabs({ className, items, children, ...props }: TabsProps) {
	const defaultValue = props.defaultValue || (items ? items[0] : undefined);

	if (items && Array.isArray(children)) {
		const tabsContent = React.Children.toArray(children);

		return (
			<Root
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
			</Root>
		);
	}

	return (
		<Root
			className={cn("my-4 w-full", className)}
			defaultValue={defaultValue}
			{...props}
		>
			{children}
		</Root>
	);
}

function TabsList({ className, ...props }: React.ComponentProps<typeof List>) {
	return (
		<List
			className={cn(
				"flex items-center gap-0 border-border border-b",
				className
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof Trigger>) {
	return (
		<Trigger
			className={cn(
				"cursor-pointer border-transparent border-b-2 px-3 py-2 font-medium text-muted-foreground text-sm",
				"hover:text-foreground",
				"focus-visible:outline-none",
				"data-[state=active]:border-b-foreground data-[state=active]:text-foreground",
				className
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof Content>) {
	return <Content className={cn("mt-4", className)} {...props} />;
}

interface TabProps {
	value?: string;
	children: React.ReactNode;
}

function Tab({ children }: TabProps) {
	return <>{children}</>;
}

export { Tab, Tabs, TabsContent, TabsList, TabsTrigger };

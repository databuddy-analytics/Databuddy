import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.ComponentProps<"div"> {
	description?: string;
	href?: string;
	icon?: React.ReactNode;
	title?: string;
}

function Card({
	className,
	href,
	title,
	description,
	icon,
	children,
	...props
}: CardProps) {
	const content = (
		<div
			className={cn(
				"not-prose group flex h-full items-start gap-3 border border-border bg-muted px-4 py-3 dark:bg-[#101010]",
				href && "cursor-pointer",
				className
			)}
			{...props}
		>
			{icon && <div className="shrink-0 text-foreground/70">{icon}</div>}
			<div className="min-w-0 flex-1">
				{title && (
					<span className="font-medium text-foreground text-sm">{title}</span>
				)}
				{description && (
					<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
				)}
				{children && (
					<div className="mt-0.5 text-muted-foreground text-xs">{children}</div>
				)}
			</div>
			{href && (
				<ArrowRightIcon
					className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
					weight="bold"
				/>
			)}
		</div>
	);

	if (href) {
		const isExternal = href.startsWith("http");

		if (isExternal) {
			return (
				<a
					className="block no-underline"
					href={href}
					rel="noopener noreferrer"
					target="_blank"
				>
					{content}
				</a>
			);
		}

		return (
			<Link className="block no-underline" href={href}>
				{content}
			</Link>
		);
	}

	return content;
}

interface CardsProps extends React.ComponentProps<"div"> {
	cols?: 1 | 2 | 3 | 4;
}

function Cards({ className, cols = 2, children, ...props }: CardsProps) {
	const gridCols = {
		1: "grid-cols-1",
		2: "grid-cols-1 md:grid-cols-2",
		3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
		4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
	};

	return (
		<div
			className={cn("my-4 grid gap-2", gridCols[cols], className)}
			{...props}
		>
			{children}
		</div>
	);
}

export { Card, Cards };

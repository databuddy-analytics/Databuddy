import { ArrowRightIcon } from "@databuddy/ui/icons";
import { Card as UICard, cn } from "@databuddy/ui";
import Link from "next/link";
import type * as React from "react";
import {
	docsIconWell,
	docsSurfaceInteractive,
} from "@/components/docs/docs-styles";

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
		<UICard
			className={cn(
				"not-prose group h-full flex-row items-start gap-3 rounded border-sidebar-border/60 bg-sidebar p-4 text-sidebar-foreground transition-[background-color,border-color]",
				href && cn("cursor-pointer", docsSurfaceInteractive),
				className
			)}
			{...props}
		>
			{icon && <div className={cn(docsIconWell, "[&_svg]:size-4")}>{icon}</div>}
			<div className="min-w-0 flex-1 pt-0.5">
				{title && (
					<span className="font-medium text-[13px] text-sidebar-foreground">
						{title}
					</span>
				)}
				{description && (
					<p className="mt-0.5 text-sidebar-foreground/55 text-xs leading-5">
						{description}
					</p>
				)}
				{children && (
					<div className="mt-2 text-sidebar-foreground/65 text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_li]:my-0.5 [&_ul]:my-0 [&_ul]:ml-4">
						{children}
					</div>
				)}
			</div>
			{href && (
				<ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-sidebar-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-sidebar-foreground/60" />
			)}
		</UICard>
	);

	if (href) {
		const isExternal = href.startsWith("http");

		if (isExternal) {
			return (
				<a
					className="block cursor-pointer no-underline"
					href={href}
					rel="noopener noreferrer"
					target="_blank"
				>
					{content}
				</a>
			);
		}

		return (
			<Link className="block cursor-pointer no-underline" href={href}>
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
			className={cn("not-prose my-4 grid gap-3", gridCols[cols], className)}
			{...props}
		>
			{children}
		</div>
	);
}

export { Card, Cards };

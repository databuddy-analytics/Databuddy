"use client";

import type { IconProps } from "@phosphor-icons/react";
import { cloneElement, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
	badgeClassName?: string;
	badgeContent?: string;
	badgeVariant?:
		| "default"
		| "secondary"
		| "destructive"
		| "outline"
		| "green"
		| "amber"
		| "gray"
		| "blue";
	className?: string;
	count?: number;
	description: string;
	icon: React.ReactElement<IconProps>;
	right?: React.ReactNode;
	title: string;
}

export const PageHeader = memo(
	({
		title,
		description,
		icon,
		className,
		badgeContent,
		badgeVariant = "secondary",
		badgeClassName,
		right,
		count,
	}: PageHeaderProps) => (
		<div
			className={cn(
				"relative flex min-h-[88px] shrink-0 items-center justify-between gap-2 border-b p-3 sm:p-4",
				className
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="shrink-0 rounded-lg border bg-secondary p-2.5">
					{cloneElement(icon, {
						...icon.props,
						className: cn(
							"size-5 text-accent-foreground",
							icon.props.className
						),
						"aria-hidden": "true",
						size: 24,
						weight: icon.props.weight ?? "duotone",
					})}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h1 className="truncate font-medium text-foreground text-xl sm:text-2xl">
							{title}
						</h1>
						{typeof count === "number" && (
							<div className="flex shrink-0 items-center gap-2 text-accent-foreground/60 text-sm">
								{count}
							</div>
						)}
						{badgeContent && (
							<Badge
								className={cn("h-5 px-2", badgeClassName)}
								variant={badgeVariant}
							>
								{badgeContent}
							</Badge>
						)}
					</div>
					<p className="truncate text-muted-foreground text-xs sm:text-sm">
						{description}
					</p>
				</div>
			</div>
			{right && (
				<div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
					{right}
				</div>
			)}
		</div>
	)
);

PageHeader.displayName = "PageHeader";

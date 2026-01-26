"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
	title: string;
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
	badgeClassName?: string;
	right?: React.ReactNode;
	count?: number;
};

export const PageHeader = memo(
	({
		title,
		badgeContent,
		badgeVariant = "secondary",
		badgeClassName,
		right,
		count,
	}: PageHeaderProps) => (
		<div className="box-border flex h-12 shrink-0 flex-row items-center justify-between gap-3 border-b px-3 sm:px-4">
			<div className="flex min-w-0 items-center gap-2">
				<h1 className="truncate font-medium text-foreground text-base leading-none">
					{title}
				</h1>
				{typeof count === "number" && (
					<span className="text-muted-foreground text-sm">{count}</span>
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
			{right && <div className="flex items-center gap-2">{right}</div>}
		</div>
	)
);

PageHeader.displayName = "PageHeader";

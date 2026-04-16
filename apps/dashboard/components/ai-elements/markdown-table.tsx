"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ElementProps = HTMLAttributes<HTMLElement> & { node?: unknown };

export const MdTable = ({
	className,
	children,
	node: _,
	...props
}: ElementProps) => (
	<div className="overflow-x-auto">
		<table className={cn("w-full text-xs", className)} {...props}>
			{children}
		</table>
	</div>
);

export const MdThead = ({
	className,
	children,
	node: _,
	...props
}: ElementProps) => (
	<thead className={cn("bg-muted/30", className)} {...props}>
		{children}
	</thead>
);

export const MdTh = ({
	className,
	children,
	node: _,
	...props
}: ElementProps) => (
	<th
		className={cn(
			"whitespace-nowrap px-3 py-1.5 text-left font-medium text-muted-foreground",
			className
		)}
		{...props}
	>
		{children}
	</th>
);

export const MdTbody = ({
	className,
	children,
	node: _,
	...props
}: ElementProps) => (
	<tbody className={cn("divide-y", className)} {...props}>
		{children}
	</tbody>
);

export const MdTd = ({
	className,
	children,
	node: _,
	...props
}: ElementProps) => (
	<td
		className={cn(
			"max-w-[260px] px-3 py-1.5 text-muted-foreground first:font-medium first:text-foreground",
			className
		)}
		{...props}
	>
		{children}
	</td>
);

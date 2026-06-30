import type * as React from "react";
import { cn } from "@databuddy/ui";
import {
	docsMutedLabel,
	docsSurface,
	docsSurfaceHeader,
} from "@/components/docs/docs-styles";

function Table({
	children,
	className,
	...props
}: React.ComponentProps<"table">) {
	return (
		<div className={cn("w-full", docsSurface)}>
			<div className="w-full overflow-x-auto">
				<table
					className={cn(
						"w-full border-collapse text-sidebar-foreground text-sm",
						className
					)}
					{...props}
				>
					{children}
				</table>
			</div>
		</div>
	);
}

function TableHeader({
	children,
	className,
	...props
}: React.ComponentProps<"thead">) {
	return (
		<thead className={cn(docsSurfaceHeader, className)} {...props}>
			{children}
		</thead>
	);
}

function TableBody({
	children,
	className,
	...props
}: React.ComponentProps<"tbody">) {
	return (
		<tbody className={className} {...props}>
			{children}
		</tbody>
	);
}

function TableRow({
	children,
	className,
	...props
}: React.ComponentProps<"tr">) {
	return (
		<tr
			className={cn(
				"border-sidebar-border/50 border-b transition-colors last:border-b-0 hover:bg-sidebar-accent/25",
				className
			)}
			{...props}
		>
			{children}
		</tr>
	);
}

function TableHead({
	children,
	className,
	...props
}: React.ComponentProps<"th">) {
	return (
		<th
			className={cn("h-10 px-4 text-left", docsMutedLabel, className)}
			{...props}
		>
			{children}
		</th>
	);
}

function TableCell({
	children,
	className,
	...props
}: React.ComponentProps<"td">) {
	return (
		<td
			className={cn(
				"px-4 py-3 text-sidebar-foreground/75 text-sm leading-5",
				className
			)}
			{...props}
		>
			{children}
		</td>
	);
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };

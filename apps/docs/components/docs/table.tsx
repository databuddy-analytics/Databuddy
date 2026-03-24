import type * as React from "react";
import { cn } from "@/lib/utils";

function Table({
	children,
	className,
	...props
}: React.ComponentProps<"table">) {
	return (
		<div className="not-prose my-4 w-full overflow-x-auto">
			<table
				className={cn(
					"w-full border-collapse border border-border bg-muted dark:bg-[#101010]",
					className
				)}
				{...props}
			>
				{children}
			</table>
		</div>
	);
}

function TableHeader({
	children,
	className,
	...props
}: React.ComponentProps<"thead">) {
	return (
		<thead className={cn("bg-foreground/5", className)} {...props}>
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
		<tr className={className} {...props}>
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
			className={cn(
				"border border-border px-4 py-2.5 text-left font-medium font-mono text-foreground/70 text-xs",
				className
			)}
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
			className={cn("border border-border px-4 py-2.5 text-sm", className)}
			{...props}
		>
			{children}
		</td>
	);
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };

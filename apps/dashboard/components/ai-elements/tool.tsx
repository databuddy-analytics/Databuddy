"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import {
	CheckCircleIcon,
	CircleNotchIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";

export type ToolStatus = "running" | "complete" | "error";

const PREVIEW_ROW_LIMIT = 5;
const PREVIEW_VALUE_MAX_LEN = 80;

function truncateValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "string") {
		return value.length > PREVIEW_VALUE_MAX_LEN
			? `${value.slice(0, PREVIEW_VALUE_MAX_LEN)}…`
			: value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	const json = JSON.stringify(value);
	return json.length > PREVIEW_VALUE_MAX_LEN
		? `${json.slice(0, PREVIEW_VALUE_MAX_LEN)}…`
		: json;
}

export type ToolProps = ComponentProps<typeof Collapsible> & {
	title: string;
	status?: ToolStatus;
};

export const Tool = ({
	className,
	title,
	status = "complete",
	children,
	...props
}: ToolProps) => {
	const isRunning = status === "running";
	const isError = status === "error";

	return (
		<Collapsible className={cn("group/tool", className)} {...props}>
			<CollapsibleTrigger className="flex w-full items-center gap-2 py-0.5 text-left text-muted-foreground text-xs hover:text-foreground">
				{isRunning ? (
					<CircleNotchIcon className="size-3.5 shrink-0 animate-spin text-primary" />
				) : isError ? (
					<XCircleIcon className="size-3.5 shrink-0 text-destructive" />
				) : (
					<CheckCircleIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
				)}
				<span
					className={cn(
						"truncate",
						isRunning && "text-foreground",
						isError && "text-destructive"
					)}
				>
					{title}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
};

export type ToolDetailProps = ComponentProps<"div">;

export const ToolDetail = ({ className, ...props }: ToolDetailProps) => (
	<div
		className={cn(
			"mt-1 w-full min-w-0 space-y-3 text-pretty rounded bg-muted/30 p-3 text-left",
			className
		)}
		{...props}
	/>
);

export interface ToolInputProps {
	className?: string;
	input: Record<string, unknown>;
}

export const ToolInput = ({ className, input }: ToolInputProps) => {
	const entries = Object.entries(input);
	if (entries.length === 0) {
		return null;
	}
	return (
		<dl
			className={cn(
				"grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-muted-foreground/80 text-xs",
				className
			)}
		>
			{entries.map(([key, value]) => (
				<div className="contents" key={key}>
					<dt className="shrink-0 text-muted-foreground/55">{key}</dt>
					<dd className="min-w-0 break-all">{truncateValue(value)}</dd>
				</div>
			))}
		</dl>
	);
};

export interface ToolOutputProps {
	className?: string;
	error?: boolean;
	output: unknown;
}

export const ToolOutput = ({ className, output, error }: ToolOutputProps) => {
	if (output === null || output === undefined) {
		return null;
	}

	if (Array.isArray(output)) {
		if (output.length === 0) {
			return null;
		}

		const preview = output.slice(0, PREVIEW_ROW_LIMIT);
		const isObjectArray = preview.every(
			(row): row is Record<string, unknown> =>
				typeof row === "object" && row !== null && !Array.isArray(row)
		);

		if (isObjectArray) {
			const columns = Array.from(
				new Set(preview.flatMap((row) => Object.keys(row)))
			).slice(0, 5);
			return (
				<div
					className={cn(
						"overflow-x-auto font-mono text-muted-foreground/80 text-xs",
						className
					)}
				>
					<table className="w-full min-w-0">
						<tbody>
							{preview.map((row, rowIdx) => (
								<tr key={`row-${rowIdx}`}>
									{columns.map((col) => (
										<td className="truncate pr-3" key={col}>
											{truncateValue(row[col])}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{output.length > PREVIEW_ROW_LIMIT ? (
						<p className="text-[10px] text-muted-foreground/40">
							+{output.length - PREVIEW_ROW_LIMIT} more
						</p>
					) : null}
				</div>
			);
		}

		return (
			<pre
				className={cn(
					"overflow-x-auto whitespace-pre-wrap break-all font-mono text-muted-foreground/80 text-xs",
					error && "text-destructive/70",
					className
				)}
			>
				{preview.map((item) => truncateValue(item)).join("\n")}
			</pre>
		);
	}

	if (typeof output === "object") {
		return <ToolInput input={output as Record<string, unknown>} />;
	}

	return (
		<p
			className={cn(
				"break-all font-mono text-muted-foreground/80 text-xs",
				error && "text-destructive/70",
				className
			)}
		>
			{truncateValue(output)}
		</p>
	);
};

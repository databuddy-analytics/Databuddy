"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { UnicodeSpinner } from "@/components/ai-elements/unicode-spinner";
import { cn } from "@/lib/utils";

export type ToolStatus = "running" | "complete" | "error";

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

	return (
		<Collapsible
			className={cn("group/tool relative pl-4", className)}
			{...props}
		>
			<div className="absolute top-0 bottom-0 left-[5px] w-px bg-border/40" />
			<div
				className={cn(
					"absolute top-[9px] left-0 size-[11px] rounded-full border",
					isRunning
						? "border-muted-foreground/40 bg-background"
						: "border-transparent bg-muted-foreground/20"
				)}
			/>
			<CollapsibleTrigger
				className={cn(
					"flex w-full items-center gap-1.5 py-0.5 text-left text-muted-foreground/50 text-xs transition-colors hover:text-muted-foreground",
					isRunning && "text-muted-foreground/70"
				)}
			>
				<span className="truncate">{title}</span>
				{isRunning ? (
					<UnicodeSpinner
						className="text-[10px] text-muted-foreground/50"
						label="Running"
						variant="dots"
					/>
				) : (
					<CaretRightIcon
						className="size-2.5 shrink-0 opacity-0 transition-opacity group-hover/tool:opacity-40 group-data-[state=open]/tool:rotate-90 group-data-[state=open]/tool:opacity-40"
						weight="bold"
					/>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent className="data-[state=open]:fade-in-0 data-[state=open]:animate-in">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
};

export type ToolDetailProps = ComponentProps<"div">;

export const ToolDetail = ({ className, ...props }: ToolDetailProps) => (
	<div
		className={cn(
			"mt-0.5 ml-1 space-y-2 pb-1 text-muted-foreground/50",
			className
		)}
		{...props}
	/>
);

export type ToolSectionProps = ComponentProps<"section"> & {
	label: string;
};

export const ToolSection = ({
	label,
	className,
	children,
	...props
}: ToolSectionProps) => (
	<section className={cn("space-y-0.5", className)} {...props}>
		<p className="text-[10px] text-muted-foreground/30 uppercase">{label}</p>
		{children}
	</section>
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
				"grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground/40 text-xs",
				className
			)}
		>
			{entries.map(([key, value]) => (
				<div className="contents" key={key}>
					<dt className="font-mono">{key}</dt>
					<dd className="truncate font-mono">{truncateValue(value)}</dd>
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

const PREVIEW_ROW_LIMIT = 5;
const PREVIEW_VALUE_MAX_LEN = 100;

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
				<div className={cn("space-y-0.5", className)}>
					<table className="w-full font-mono text-[11px] text-muted-foreground/40">
						<thead>
							<tr>
								{columns.map((col) => (
									<th
										className="pr-3 text-left font-normal text-muted-foreground/30"
										key={col}
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
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
						<p className="text-[10px] text-muted-foreground/25">
							{output.length} rows · first {PREVIEW_ROW_LIMIT}
						</p>
					) : null}
				</div>
			);
		}

		return (
			<pre
				className={cn(
					"font-mono text-[11px] text-muted-foreground/40",
					error && "text-destructive/50",
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
				"truncate font-mono text-[11px] text-muted-foreground/40",
				error && "text-destructive/50",
				className
			)}
		>
			{truncateValue(output)}
		</p>
	);
};

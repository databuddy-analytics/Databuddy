"use client";

import {
	ArrowDownIcon,
	CheckCircleIcon,
	CircleIcon,
	ClockIcon,
	WrenchIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import type { ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
	<Collapsible
		className={cn(
			"not-prose mb-4 w-full overflow-hidden rounded-lg border border-border/70 bg-card",
			className
		)}
		open={false}
		{...props}
	/>
);

export type ToolHeaderProps = {
	type: ToolUIPart["type"];
	state: ToolUIPart["state"];
	className?: string;
};

const getStatusBadge = (status: ToolUIPart["state"]) => {
	const labels = {
		"input-streaming": "Pending",
		"input-available": "Running",
		"output-available": "Completed",
		"output-error": "Error",
	} as const;

	const icons = {
		"input-streaming": (
			<CircleIcon className="size-4 text-muted-foreground" weight="fill" />
		),
		"input-available": (
			<ClockIcon className="size-4 text-foreground" weight="duotone" />
		),
		"output-available": (
			<CheckCircleIcon className="size-4 text-success" weight="duotone" />
		),
		"output-error": (
			<XCircleIcon className="size-4 text-destructive" weight="duotone" />
		),
	} as const;

	return (
		<Badge className="gap-1.5 rounded-full text-[11px]" variant="secondary">
			{icons[status]}
			{labels[status]}
		</Badge>
	);
};

export const ToolHeader = ({
	className,
	type,
	state,
	...props
}: ToolHeaderProps) => (
	<CollapsibleTrigger
		className={cn(
			"group flex w-full items-center justify-between gap-4 bg-muted/50 px-3 py-2",
			className
		)}
		{...props}
	>
		<div className="flex items-center gap-2">
			<WrenchIcon className="size-4 text-muted-foreground" weight="duotone" />
			<span className="font-medium text-foreground text-sm capitalize">
				{type}
			</span>
			{getStatusBadge(state)}
		</div>
		<ArrowDownIcon
			className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
			weight="duotone"
		/>
	</CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			"border-border/60 border-t bg-card text-foreground outline-none",
			className
		)}
		{...props}
	/>
);

export type ToolInputProps = ComponentProps<"div"> & {
	input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
	<div
		className={cn("space-y-2 overflow-hidden p-4 text-sm", className)}
		{...props}
	>
		<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			Parameters
		</h4>
		<div className="rounded-md border border-border/60 bg-muted/50">
			<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
		</div>
	</div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
	output: ToolUIPart["output"];
	errorText: ToolUIPart["errorText"];
};

export const ToolOutput = ({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) => {
	if (!(output || errorText)) {
		return null;
	}

	let Output = <div>{output as ReactNode}</div>;

	if (typeof output === "object") {
		Output = (
			<CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
		);
	} else if (typeof output === "string") {
		Output = <CodeBlock code={output} language="json" />;
	}

	return (
		<div className={cn("space-y-2 p-4 text-sm", className)} {...props}>
			<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{errorText ? "Error" : "Result"}
			</h4>
			<div
				className={cn(
					"overflow-x-auto rounded-md border text-xs [&_table]:w-full",
					errorText
						? "border-destructive/50 bg-destructive/10 text-destructive"
						: "border-border/60 bg-muted/50 text-foreground"
				)}
			>
				{errorText && <div>{errorText}</div>}
				{Output}
			</div>
		</div>
	);
};

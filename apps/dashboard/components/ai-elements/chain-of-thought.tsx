"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";
import { cn } from "@/lib/utils";

export type ToolStepProps = ComponentProps<"div"> & {
	label: ReactNode;
	status?: "complete" | "active";
};

export const ToolStep = memo(
	({ className, label, status = "complete", ...props }: ToolStepProps) => (
		<div
			className={cn(
				"flex items-center gap-2 py-0.5 text-muted-foreground text-xs",
				status === "active" && "text-foreground",
				className
			)}
			{...props}
		>
			{status === "complete" ? (
				<CheckCircleIcon
					className="size-3 shrink-0 text-muted-foreground/60"
					weight="fill"
				/>
			) : (
				<CircleNotchIcon
					className="size-3 shrink-0 animate-spin"
					weight="bold"
				/>
			)}
			<span>{label}</span>
		</div>
	)
);

ToolStep.displayName = "ToolStep";

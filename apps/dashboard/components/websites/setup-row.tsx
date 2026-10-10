"use client";

import { CheckIcon } from "@databuddy/ui/icons";
import type { ReactNode } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

export type SetupRowStatus =
	| "active"
	| "done"
	| "pending"
	| "skipped"
	| "waiting";

function RowMarker({ status }: { status: SetupRowStatus }) {
	return (
		<span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
			<span
				className={cn(
					"absolute inset-0 flex items-center justify-center rounded-full bg-success text-success-foreground transition-[opacity,transform] duration-200 ease-in-out",
					status === "done" ? "scale-100 opacity-100" : "scale-50 opacity-0"
				)}
			>
				<CheckIcon className="size-2.5" />
			</span>
			<svg
				aria-hidden="true"
				className={cn(
					"size-4 transition-[opacity,color] duration-200 ease-in-out",
					status === "done" && "opacity-0",
					status === "pending" && "text-muted-foreground/50",
					status === "active" && "text-foreground",
					status === "waiting" &&
						"animate-spin text-foreground [animation-duration:1.6s] motion-reduce:animate-none",
					status === "skipped" && "text-muted-foreground/60"
				)}
				fill="none"
				viewBox="0 0 16 16"
			>
				<circle
					cx="8"
					cy="8"
					r="6.5"
					stroke="currentColor"
					strokeDasharray={status === "skipped" ? undefined : "0.1 3.4"}
					strokeLinecap="round"
					strokeWidth="1.5"
				/>
				{status === "skipped" ? (
					<path
						d="M5.5 8h5"
						stroke="currentColor"
						strokeLinecap="round"
						strokeWidth="1.5"
					/>
				) : null}
			</svg>
		</span>
	);
}

export function SetupRow({
	children,
	detail,
	expanded,
	onToggle,
	status,
	title,
}: {
	children?: ReactNode;
	detail?: string | null;
	expanded: boolean;
	onToggle?: () => void;
	status: SetupRowStatus;
	title: string;
}) {
	const header = (
		<>
			<RowMarker status={status} />
			<span className="min-w-0 flex-1">
				<span
					className={cn(
						"block truncate font-medium text-sm transition-colors duration-200",
						status === "pending" && "text-muted-foreground"
					)}
				>
					{title}
				</span>
				{detail && status === "waiting" ? (
					<Shimmer as="span" className="mt-0.5 block text-xs">
						{detail}
					</Shimmer>
				) : null}
			</span>
			{detail && status !== "waiting" ? (
				<span className="min-w-0 truncate text-muted-foreground text-xs">
					{detail}
				</span>
			) : null}
		</>
	);
	return (
		<div className="border-border border-b last:border-b-0">
			{onToggle ? (
				// policy-ignore dashboard/no-raw-interactive-html: full-width disclosure row; Button variants add padding and focus styles that fight the row layout
				<button
					aria-expanded={expanded}
					className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-accent/40"
					onClick={onToggle}
					type="button"
				>
					{header}
				</button>
			) : (
				<div className="flex items-start gap-3 px-5 py-4">{header}</div>
			)}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none",
					expanded && children ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
				)}
				inert={!expanded}
			>
				<div className="min-h-0 overflow-hidden">
					<div
						className={cn(
							"pt-2 pr-6 pb-6 pl-12 transition-opacity duration-200 ease-in-out",
							expanded ? "opacity-100" : "opacity-0"
						)}
					>
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}

"use client";

import {
	ArrowClockwiseIcon,
	TrendUpIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Empty state for the usage section when no features have been used yet.
 * Used in the main content area of billing overview.
 */
export function EmptyUsageState() {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
				<TrendUpIcon
					className="text-muted-foreground"
					size={24}
					weight="duotone"
				/>
			</div>
			<p className="font-semibold">No usage data yet</p>
			<p className="mt-1 max-w-xs text-muted-foreground text-sm">
				Start using features to see your consumption stats here
			</p>
		</div>
	);
}

type ErrorStateProps = {
	error: Error | unknown;
	onRetry: () => void;
};

/**
 * Error state shown when billing data fails to load.
 * Provides a retry action for the user.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
	const errorMessage =
		error instanceof Error ? error.message : "Failed to load billing data";

	return (
		<div className="flex h-full flex-col items-center justify-center p-8">
			<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
				<WarningCircleIcon
					className="text-destructive"
					size={24}
					weight="duotone"
				/>
			</div>
			<p className="font-semibold">Something went wrong</p>
			<p className="mt-1 mb-4 max-w-xs text-center text-muted-foreground text-sm">
				{errorMessage}
			</p>
			<Button onClick={onRetry} size="sm" variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={14} />
				Try again
			</Button>
		</div>
	);
}

"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

interface ErrorStateProps {
	error: Error | unknown;
	onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
	const errorMessage =
		error instanceof Error ? error.message : "Failed to load billing data";

	return (
		<div className="flex h-full flex-col items-center justify-center p-8">
			<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
				<WarningCircleIcon className="text-destructive" size={24} />
			</div>
			<p className="font-semibold">Something went wrong</p>
			<p className="mt-1 mb-4 max-w-xs text-center text-muted-foreground text-sm">
				{errorMessage}
			</p>
			<Button className="mt-2" onClick={onRetry} size="sm" variant="secondary">
				<ArrowClockwiseIcon size={14} />
				Try again
			</Button>
		</div>
	);
}

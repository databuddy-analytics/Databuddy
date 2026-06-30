"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	WarningIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

function displayMessageForError(error: Error | undefined): string {
	if (!error?.message?.trim()) {
		return "Couldn't finish your request.";
	}

	const raw = error.message.trim();
	const lower = raw.toLowerCase();

	if (
		lower === "network error" ||
		lower.includes("failed to fetch") ||
		lower.includes("load failed") ||
		lower.includes("networkerror") ||
		lower.includes("fetch failed")
	) {
		return "Connection interrupted.";
	}

	if (error.name === "AbortError" || lower.includes("abort")) {
		return "Request cancelled.";
	}

	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "Request timed out.";
	}

	if (
		lower.includes("premature close") ||
		lower.includes("connection closed")
	) {
		return "Connection dropped.";
	}

	return "Request failed.";
}

interface AgentErrorMessageProps {
	error: Error | undefined;
	onDismissAction: () => void;
	onRetryAction: () => Promise<void>;
}

export function AgentErrorMessage({
	error,
	onDismissAction,
	onRetryAction,
}: AgentErrorMessageProps) {
	const [isRetrying, setIsRetrying] = useState(false);

	const handleRetry = useCallback(async () => {
		setIsRetrying(true);
		try {
			await onRetryAction();
		} finally {
			setIsRetrying(false);
		}
	}, [onRetryAction]);

	const message = displayMessageForError(error);

	return (
		<div className="flex items-center gap-2 py-1.5 text-xs" role="alert">
			<WarningIcon
				className="size-3.5 shrink-0 text-destructive"
				weight="fill"
			/>
			<span className="min-w-0 flex-1 truncate text-muted-foreground">
				{message}
			</span>
			<Button
				aria-busy={isRetrying}
				aria-label="Try again"
				className="h-6 gap-1 px-1.5 text-xs"
				disabled={isRetrying}
				onClick={handleRetry}
				size="sm"
				title="Try again"
				variant="ghost"
			>
				<ArrowClockwiseIcon
					className={cn("size-3.5", isRetrying && "animate-spin")}
					weight="bold"
				/>
				<span>Try again</span>
			</Button>
			<Button
				aria-label="Dismiss"
				className="size-5"
				disabled={isRetrying}
				onClick={onDismissAction}
				size="icon-sm"
				title="Dismiss"
				variant="ghost"
			>
				<XMarkIcon className="size-3" />
			</Button>
		</div>
	);
}

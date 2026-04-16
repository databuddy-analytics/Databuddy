"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function displayMessageForError(error: Error | undefined): string {
	if (!error?.message?.trim()) {
		return "The request could not finish. Try again.";
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
		return "Connection interrupted. Check your network and try again.";
	}

	if (error.name === "AbortError" || lower.includes("abort")) {
		return "The request was cancelled.";
	}

	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "The request took too long. Try again.";
	}

	if (
		lower.includes("premature close") ||
		lower.includes("connection closed")
	) {
		return "The connection closed unexpectedly. Try again.";
	}

	return "The request failed. Try again.";
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
		<div
			className="rounded border border-destructive/25 bg-destructive/5 px-3 py-2.5"
			role="alert"
		>
			<div className="flex items-start gap-2">
				<XCircleIcon
					className="mt-0.5 size-4 shrink-0 text-destructive"
					weight="fill"
				/>
				<div className="min-w-0 flex-1 space-y-1">
					<p className="text-balance font-medium text-destructive text-sm">
						Something went wrong
					</p>
					<p className="text-pretty text-muted-foreground text-xs">{message}</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<Button
					aria-busy={isRetrying}
					disabled={isRetrying}
					onClick={handleRetry}
					size="sm"
					type="button"
					variant="outline"
				>
					<ArrowClockwiseIcon
						className={cn(isRetrying && "animate-spin")}
						weight="fill"
					/>
					Try again
				</Button>
				<Button
					disabled={isRetrying}
					onClick={onDismissAction}
					size="sm"
					type="button"
					variant="ghost"
				>
					Dismiss
				</Button>
			</div>
		</div>
	);
}

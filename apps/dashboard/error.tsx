"use client";

import { useEffect } from "react";
import { ArrowClockwiseIcon, WarningIcon } from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

interface ErrorPageProps {
	error: Error & { digest?: string };
	reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<div className="flex min-h-dvh items-center justify-center bg-muted/20">
			<Card className="w-full max-w-lg border-destructive/50 shadow-lg">
				<Card.Header>
					<Card.Title className="flex items-center gap-2 text-destructive">
						<WarningIcon className="size-6" size={24} weight="duotone" />
						Something went wrong
					</Card.Title>
				</Card.Header>
				<Card.Content className="space-y-4 pt-6">
					<p className="text-muted-foreground text-sm">
						We encountered an unexpected error. Please try again. If the problem
						persists, please contact support.
					</p>
					{error.digest && (
						<p className="font-mono text-muted-foreground text-xs">
							Reference: {error.digest}
						</p>
					)}
					<Button onClick={() => reset()} size="sm">
						<ArrowClockwiseIcon className="mr-2 size-4" size={16} />
						Try again
					</Button>
				</Card.Content>
			</Card>
		</div>
	);
}

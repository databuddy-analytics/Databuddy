"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AgentError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		throw new Error(error.message);
	}, [error]);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
			<div className="space-y-2 text-center">
				<h2 className="font-semibold text-lg">Something went wrong!</h2>
				<p className="text-muted-foreground text-sm">
					{error.message || "An error occurred while loading the agent"}
				</p>
			</div>
			<Button onClick={reset} variant="outline">
				Try again
			</Button>
		</div>
	);
}

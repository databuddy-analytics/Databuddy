"use client";

import { useEffect } from "react";
import {
	StatusErrorShell,
	StatusRetryButton,
} from "./_components/status-error-shell";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Status page error:", error);
	}, [error]);

	return (
		<StatusErrorShell
			action={<StatusRetryButton onClick={reset} />}
			code="503"
			description="Current monitor data could not be loaded. Try again in a moment."
			detail={error.digest}
			title="Status unavailable"
		/>
	);
}

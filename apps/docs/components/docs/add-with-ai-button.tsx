"use client";

import { CheckIcon, RobotIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ADD_DATABUDDY_AI_PROMPT = `Add Databuddy analytics to this repository end-to-end:

1. Install @databuddy/sdk (bun add @databuddy/sdk) or add the async script from https://cdn.databuddy.cc per https://www.databuddy.cc/docs/getting-started
2. Read the Client ID from an environment variable; never hardcode secrets
3. Mount tracking at the application root (e.g. layout) so page views and custom events work
4. If another analytics tool is present, explain what to disable or run in parallel during validation

Follow the official docs for this project's framework (React, Next.js, or vanilla HTML).`;

export function AddWithAiButton() {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopyAction = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(ADD_DATABUDDY_AI_PROMPT);
			setCopied(true);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			timeoutRef.current = setTimeout(() => {
				setCopied(false);
			}, 2000);
		} catch {
			// Clipboard API unavailable (e.g. insecure context)
		}
	}, []);

	return (
		<div className="not-prose my-6 flex flex-wrap items-center gap-3">
			<button
				aria-label="Copy prompt to add Databuddy with your AI coding assistant"
				className={cn(
					"inline-flex items-center gap-2 border border-border bg-muted/40 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					copied && "border-primary/50 bg-primary/5"
				)}
				onClick={handleCopyAction}
				type="button"
			>
				{copied ? (
					<CheckIcon className="size-4 text-primary" weight="bold" />
				) : (
					<RobotIcon className="size-4" weight="duotone" />
				)}
				{copied ? "Copied prompt" : "Add with AI"}
			</button>
			<p className="max-w-prose text-muted-foreground text-xs sm:text-sm">
				Copies a ready-made prompt for Cursor, Copilot, or other AI assistants
				to install and wire Databuddy in this repo.
			</p>
		</div>
	);
}

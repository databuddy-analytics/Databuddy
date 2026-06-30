"use client";

import { Button, Input } from "@databuddy/ui";
import { CheckIcon, EnvelopeSimpleIcon } from "@databuddy/ui/icons";
import { track } from "@databuddy/sdk";
import { useRef, useState } from "react";

type FormStatus = "idle" | "loading" | "success" | "error";

export type NewsletterSource = "footer" | "blog" | "pricing" | "inline";

export function NewsletterForm({
	source = "footer",
}: {
	source?: NewsletterSource;
}) {
	const [status, setStatus] = useState<FormStatus>("idle");
	const [errorMessage, setErrorMessage] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const email = inputRef.current?.value.trim();
		if (!email) {
			return;
		}

		setStatus("loading");
		setErrorMessage("");

		try {
			const response = await fetch("/api/newsletter/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});

			const data = (await response.json()) as Record<string, unknown>;

			if (!response.ok) {
				throw new Error(String(data.error ?? "Something went wrong"));
			}

			setStatus("success");
			track("newsletter_subscribed", { source });
			if (inputRef.current) {
				inputRef.current.value = "";
			}
		} catch (err) {
			setStatus("error");
			setErrorMessage(
				err instanceof Error ? err.message : "Something went wrong"
			);
		}
	};

	if (status === "success") {
		return (
			<div className="flex items-center gap-2 text-foreground text-sm">
				<CheckIcon className="size-4" />
				<span>You're in. Watch your inbox.</span>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<form className="flex gap-2" onSubmit={handleSubmit}>
				<Input
					className="h-9 w-full min-w-0"
					disabled={status === "loading"}
					placeholder="you@company.com"
					ref={inputRef}
					required
					type="email"
				/>
				<Button
					aria-label="Subscribe to newsletter"
					disabled={status === "loading"}
					loading={status === "loading"}
					size="icon"
					type="submit"
				>
					<EnvelopeSimpleIcon className="size-4" />
				</Button>
			</form>
			{status === "error" && errorMessage ? (
				<p className="text-destructive text-xs">{errorMessage}</p>
			) : null}
		</div>
	);
}

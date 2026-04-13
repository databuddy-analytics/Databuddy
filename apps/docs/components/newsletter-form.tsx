"use client";

import { CheckIcon, PaperPlaneIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";

type FormStatus = "idle" | "loading" | "success" | "error";

export function NewsletterForm() {
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
				<CheckIcon className="size-4" weight="bold" />
				<span>You're in. Watch your inbox.</span>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<form className="flex gap-2" onSubmit={handleSubmit}>
				<input
					className="w-full min-w-0 self-stretch rounded border border-border bg-background px-3 text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
					disabled={status === "loading"}
					placeholder="you@company.com"
					ref={inputRef}
					required
					type="email"
				/>
				<button
					aria-label="Subscribe to newsletter"
					className="inline-flex size-9 shrink-0 items-center justify-center rounded bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					disabled={status === "loading"}
					type="submit"
				>
					<PaperPlaneIcon className="size-3.5" weight="fill" />
				</button>
			</form>
			{status === "error" && errorMessage ? (
				<p className="text-destructive text-xs">{errorMessage}</p>
			) : null}
		</div>
	);
}

"use client";

import { ThumbsDownIcon, ThumbsUpIcon } from "@databuddy/ui/icons";
import { Button, Textarea, cn } from "@databuddy/ui";
import { usePathname } from "next/navigation";
import { type SyntheticEvent, useEffect, useState, useTransition } from "react";

export interface Feedback {
	message: string;
	opinion: "good" | "bad";
	url?: string;
}

export interface ActionResponse {
	error?: string;
	success: boolean;
}

interface Result extends Feedback {
	response?: ActionResponse;
}

export function Feedback({
	onRateAction,
}: {
	onRateAction: (url: string, feedback: Feedback) => Promise<ActionResponse>;
}) {
	const url = usePathname();
	const [previous, setPrevious] = useState<Result | null>(null);
	const [opinion, setOpinion] = useState<"good" | "bad" | null>(null);
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		const item = localStorage.getItem(`docs-feedback-${url}`);
		if (item === null) {
			return;
		}
		setPrevious(JSON.parse(item) as Result);
	}, [url]);

	useEffect(() => {
		const key = `docs-feedback-${url}`;
		if (previous) {
			localStorage.setItem(key, JSON.stringify(previous));
		} else {
			localStorage.removeItem(key);
		}
	}, [previous, url]);

	function submit(e?: SyntheticEvent) {
		if (opinion === null) {
			return;
		}
		setError(null);

		startTransition(() => {
			const feedback: Feedback = { opinion, message };
			onRateAction(url, feedback).then((response) => {
				if (response.success) {
					setPrevious({ response, ...feedback });
					setMessage("");
					setOpinion(null);
				} else {
					setError(response.error ?? "Something went wrong");
				}
			});
		});

		e?.preventDefault();
	}

	const activeOpinion = previous?.opinion ?? opinion;
	const isExpanded = opinion !== null || previous !== null;

	return (
		<div className="border-border/60 border-y py-4">
			<div className="flex items-center gap-2">
				<p className="pe-2 font-medium text-foreground text-sm">
					How is this guide?
				</p>
				<Button
					className={cn(
						activeOpinion === "good" &&
							"bg-primary/10 text-primary hover:bg-primary/15"
					)}
					disabled={previous !== null}
					onClick={() => setOpinion("good")}
					size="sm"
					variant="ghost"
				>
					<ThumbsUpIcon className="size-3.5" />
					Good
				</Button>
				<Button
					className={cn(
						activeOpinion === "bad" &&
							"bg-destructive/10 text-destructive hover:bg-destructive/15"
					)}
					disabled={previous !== null}
					onClick={() => setOpinion("bad")}
					size="sm"
					variant="ghost"
				>
					<ThumbsDownIcon className="size-3.5" />
					Bad
				</Button>
			</div>

			{isExpanded && (
				<div className="mt-3">
					{previous ? (
						<div className="flex flex-col items-center gap-3 rounded-md bg-secondary px-3 py-6 text-center text-muted-foreground text-sm">
							<p>Thank you for your feedback!</p>
							<Button
								onClick={() => {
									setOpinion(previous.opinion);
									setPrevious(null);
									setError(null);
								}}
								size="sm"
								variant="secondary"
							>
								Submit again
							</Button>
						</div>
					) : (
						<form className="flex flex-col gap-3" onSubmit={submit}>
							<Textarea
								autoFocus
								className={cn(
									"resize-none",
									error &&
										"ring-2 ring-destructive/60 focus-within:ring-destructive/60"
								)}
								onChange={(e) => {
									setMessage(e.target.value);
									if (error) {
										setError(null);
									}
								}}
								onKeyDown={(e) => {
									if (!e.shiftKey && e.key === "Enter") {
										submit(e);
									}
								}}
								placeholder="Leave your feedback…"
								required
								value={message}
							/>
							{error && <p className="text-destructive text-xs">{error}</p>}
							<Button
								className="w-fit"
								disabled={isPending}
								loading={isPending}
								size="sm"
								type="submit"
								variant="secondary"
							>
								Submit
							</Button>
						</form>
					)}
				</div>
			)}
		</div>
	);
}

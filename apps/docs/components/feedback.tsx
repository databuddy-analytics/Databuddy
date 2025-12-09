"use client";

import { ThumbsDownIcon, ThumbsUpIcon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import {
	Collapsible,
	CollapsibleContent,
} from "fumadocs-ui/components/ui/collapsible";
import { usePathname } from "next/navigation";
import { type SyntheticEvent, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

const rateButtonVariants = cva(
	"inline-flex items-center gap-2 rounded border px-3 py-2 font-medium text-sm disabled:cursor-not-allowed [&_svg]:size-4",
	{
		variants: {
			active: {
				true: "border-primary/20 bg-primary/10 text-primary [&_svg]:fill-current",
				false: "text-muted-foreground hover:bg-muted/50",
			},
		},
	}
);

export type Feedback = {
	opinion: "good" | "bad";
	url?: string;
	message: string;
};

export type ActionResponse = {
	success: boolean;
	error?: string;
};

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
			const feedback: Feedback = {
				opinion,
				message,
			};

			onRateAction(url, feedback).then((response) => {
				if (response.success) {
					setPrevious({
						response,
						...feedback,
					});
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

	return (
		<Collapsible
			className="border-border border-y py-3"
			onOpenChange={(v) => {
				if (!v) {
					setOpinion(null);
				}
			}}
			open={opinion !== null || previous !== null}
		>
			<div className="flex flex-row items-center gap-2">
				<p className="pe-2 font-medium text-sm">How is this guide?</p>
				<button
					className={cn(
						rateButtonVariants({
							active: activeOpinion === "good",
						})
					)}
					disabled={previous !== null}
					onClick={() => {
						setOpinion("good");
					}}
					type="button"
				>
					<ThumbsUpIcon
						weight={activeOpinion === "good" ? "fill" : "duotone"}
					/>
					Good
				</button>
				<button
					className={cn(
						rateButtonVariants({
							active: activeOpinion === "bad",
						})
					)}
					disabled={previous !== null}
					onClick={() => {
						setOpinion("bad");
					}}
					type="button"
				>
					<ThumbsDownIcon
						weight={activeOpinion === "bad" ? "fill" : "duotone"}
					/>
					Bad
				</button>
			</div>
			<CollapsibleContent className="mt-3">
				{previous ? (
					<div className="flex flex-col items-center gap-3 rounded bg-muted/50 px-3 py-6 text-center text-muted-foreground text-sm">
						<p>Thank you for your feedback!</p>
						<button
							className={cn(
								buttonVariants({
									variant: "outline",
								}),
								"text-xs"
							)}
							onClick={() => {
								setOpinion(previous.opinion);
								setPrevious(null);
								setError(null);
							}}
							type="button"
						>
							Submit Again
						</button>
					</div>
				) : (
					<form className="flex flex-col gap-3" onSubmit={submit}>
						<textarea
							autoFocus
							className={cn(
								"resize-none rounded border bg-muted/30 p-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
								error
									? "border-red-500 focus-visible:ring-red-500/50"
									: "border-border focus-visible:ring-primary/50"
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
						{error && <p className="text-red-500 text-sm">{error}</p>}
						<button
							className={cn(
								buttonVariants({ variant: "outline" }),
								"w-fit px-3"
							)}
							disabled={isPending}
							type="submit"
						>
							{isPending ? "Submitting…" : "Submit"}
						</button>
					</form>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

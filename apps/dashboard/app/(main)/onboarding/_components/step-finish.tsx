"use client";

import type { OnboardingIntent } from "@databuddy/shared/custom-events";
import { Button, Field, Textarea } from "@databuddy/ui";
import { useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";
import { BusinessContextMarkdown } from "../../organizations/components/business-context-content";
import { OnboardingStepHeader, ResearchStatus } from "./onboarding-shell";
import type { OnboardingResearch } from "./use-onboarding-research";

export const INTENT_OPTIONS: {
	id: OnboardingIntent;
	label: string;
	path: string;
	priority: string;
}[] = [
	{
		id: "traffic",
		label: "Where visitors come from",
		path: "",
		priority:
			"Understand which channels bring visitors and which ones are growing.",
	},
	{
		id: "conversions",
		label: "Whether they convert",
		path: "/goals",
		priority:
			"Know whether visitors sign up or buy, and where they drop off before that.",
	},
	{
		id: "performance",
		label: "Speed and errors",
		path: "/vitals",
		priority: "Catch slow pages and JavaScript errors before users complain.",
	},
	{
		id: "ai_visibility",
		label: "AI crawlers",
		path: "/agents",
		priority: "See which AI crawlers read the site and what they take.",
	},
];

export interface FinishReview {
	error: boolean;
	loading: boolean;
	onRetry: () => void;
}

interface StepFinishProps {
	intent: OnboardingIntent | null;
	onChangeIntent: (intent: OnboardingIntent | null) => void;
	onChangePriority: (value: string) => void;
	onStartResearch: () => void;
	priority: string;
	research: OnboardingResearch;
	review: FinishReview | null;
	saveError: string | null;
	websiteName: string;
}

function Brief({ research }: { research: OnboardingResearch }) {
	const [expanded, setExpanded] = useState(false);
	const streaming =
		research.phase === "reading" || research.phase === "writing";
	if (!research.content) {
		return null;
	}
	return (
		<div className="space-y-2">
			<div
				className={cn(
					"rounded bg-muted/50 px-4 py-3",
					!(expanded || streaming) && "max-h-48 overflow-hidden"
				)}
			>
				<BusinessContextMarkdown
					content={research.content}
					streaming={streaming}
				/>
			</div>
			{streaming ? (
				<Shimmer className="text-xs">Still writing</Shimmer>
			) : (
				<Button
					className="h-auto px-0 text-xs underline underline-offset-2"
					onClick={() => setExpanded((value) => !value)}
					size="sm"
					variant="ghost"
				>
					{expanded ? "Show less" : "Read the full brief"}
				</Button>
			)}
		</div>
	);
}

export function StepFinish({
	intent,
	onChangeIntent,
	onChangePriority,
	onStartResearch,
	priority,
	research,
	review,
	saveError,
	websiteName,
}: StepFinishProps) {
	const ready = research.phase === "ready";
	const question =
		research.questions.find((item) => item.field === "priority")?.question ??
		"What matters most right now?";

	return (
		<div>
			<OnboardingStepHeader
				description={
					ready
						? "Every insight and investigation starts from this. Correct it later in Settings."
						: "One sentence is enough. Every insight and investigation starts from this."
				}
				title={
					ready
						? `Here's what Databunny learned about ${websiteName}`
						: `What should Databunny watch for ${websiteName}?`
				}
			/>

			<div className="space-y-6">
				{ready ? null : (
					<ResearchStatus
						domain={research.domain}
						pagesRead={research.pagesRead}
						phase={research.phase}
					/>
				)}
				{research.phase === "idle" && research.canStart ? (
					<Button onClick={onStartResearch} size="sm" variant="secondary">
						Let Databunny read {research.domain}
					</Button>
				) : null}

				<Brief research={research} />

				<Field>
					<Field.Label>{question}</Field.Label>
					<div className="flex flex-wrap gap-2 pb-1">
						{INTENT_OPTIONS.map((option) => {
							const selected = intent === option.id;
							return (
								<Button
									aria-pressed={selected}
									className={cn(
										"h-auto border px-2.5 py-1.5 text-xs",
										selected
											? "border-foreground/30 bg-accent font-medium text-foreground"
											: "border-border"
									)}
									key={option.id}
									onClick={() => {
										onChangeIntent(selected ? null : option.id);
										onChangePriority(selected ? "" : option.priority);
									}}
									size="sm"
									variant="ghost"
								>
									{option.label}
								</Button>
							);
						})}
					</div>
					<Textarea
						maxRows={5}
						minRows={2}
						onChange={(event) => {
							onChangePriority(event.target.value);
							onChangeIntent(
								INTENT_OPTIONS.find(
									(option) => option.priority === event.target.value
								)?.id ?? null
							);
						}}
						placeholder="Pick one above, or write your own"
						value={priority}
					/>
				</Field>

				{saveError ? (
					<p className="text-destructive text-xs" role="alert">
						{saveError}
					</p>
				) : null}
				{review?.error ? (
					<p className="text-muted-foreground text-xs" role="alert">
						We couldn't check Insights.{" "}
						<Button
							className="h-auto px-0 text-xs underline underline-offset-2"
							onClick={review.onRetry}
							size="sm"
							variant="ghost"
						>
							Try again
						</Button>
						, or open the dashboard.
					</p>
				) : null}
			</div>
		</div>
	);
}

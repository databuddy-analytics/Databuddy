"use client";

import type { OnboardingIntent } from "@databuddy/shared/custom-events";
import { Button, Textarea } from "@databuddy/ui";
import { cn } from "@/lib/utils";
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

interface WhatMattersProps {
	intent: OnboardingIntent | null;
	onChangeIntent: (intent: OnboardingIntent | null) => void;
	onChangePriority: (value: string) => void;
	onSave: () => void;
	priority: string;
	research: OnboardingResearch;
	saveError: string | null;
	saving: boolean;
}

export function WhatMatters({
	intent,
	onChangeIntent,
	onChangePriority,
	onSave,
	priority,
	research,
	saveError,
	saving,
}: WhatMattersProps) {
	const question =
		research.questions.find((item) => item.field === "priority")?.question ??
		"What matters most for the site right now?";
	return (
		<div className="max-w-xl space-y-4">
			<p className="font-medium text-sm">{question}</p>
			<div className="flex flex-wrap gap-2">
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
				maxRows={4}
				minRows={1}
				onChange={(event) => {
					onChangePriority(event.target.value);
					onChangeIntent(
						INTENT_OPTIONS.find(
							(option) => option.priority === event.target.value
						)?.id ?? null
					);
				}}
				placeholder="Or write your own"
				value={priority}
			/>
			{saveError ? (
				<p className="text-destructive text-xs" role="alert">
					{saveError}
				</p>
			) : null}
			<div className="flex justify-end">
				<Button
					disabled={!priority.trim()}
					loading={saving}
					onClick={onSave}
					size="sm"
				>
					Save
				</Button>
			</div>
		</div>
	);
}

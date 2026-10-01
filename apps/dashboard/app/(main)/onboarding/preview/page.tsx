"use client";

import type { OnboardingIntent } from "@databuddy/shared/custom-events";
import { Button } from "@databuddy/ui";
import { notFound } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, Suspense, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { cn } from "@/lib/utils";
import { OnboardingShell } from "../_components/onboarding-shell";
import {
	type FinishReview,
	INTENT_OPTIONS,
	StepFinish,
} from "../_components/step-finish";
import { StepInstall, type TrackingStatus } from "../_components/step-install";
import { StepWebsite } from "../_components/step-website";
import {
	EMPTY_RESEARCH,
	type OnboardingResearch,
} from "../_components/use-onboarding-research";

const WEBSITE = { id: "preview-website-id", domain: "acme.com", name: "Acme" };

const BRIEF = `# Acme

Acme sells a project management tool for small agencies. The site has a free tier with a 14-day trial of the paid plans, and pricing is per seat.

## What the site is for

- Convert visitors into trial sign-ups from the homepage and the pricing page
- Explain integrations with Slack, Linear, and GitHub on dedicated pages
- Publish a weekly blog aimed at agency owners

## What matters

The pricing page is the clearest decision point. Documentation lives on a separate subdomain, so docs traffic will not show up here unless it is added as a website.`;

function research(
	phase: OnboardingResearch["phase"],
	overrides: Partial<OnboardingResearch> = {}
): OnboardingResearch {
	return { ...EMPTY_RESEARCH, domain: WEBSITE.domain, phase, ...overrides };
}

const RESEARCH = {
	idle: research("idle", { canStart: true }),
	unavailable: research("unavailable", {
		message: "AI draft generation is not configured.",
	}),
	readingStart: research("reading"),
	reading: research("reading", { pagesRead: 3 }),
	writing: research("writing", { pagesRead: 5, content: BRIEF.slice(0, 180) }),
	ready: research("ready", {
		pagesRead: 5,
		content: BRIEF,
		questions: [
			{
				field: "priority",
				question: "What is the one outcome you most want to grow this quarter?",
			},
		],
	}),
	failed: research("failed", {
		pagesRead: 1,
		pagesFailed: 2,
		canStart: true,
		message: "The site did not respond in time.",
	}),
} satisfies Record<string, OnboardingResearch>;

const TRACKING = {
	awaiting: { state: "awaiting", issue: null },
	verified: { state: "verified", issue: null },
	issue: {
		state: "awaiting",
		issue: {
			message: "Events from staging.acme.com were blocked.",
			fix: "Add staging.acme.com to the allowed origins in Settings, or install the script on acme.com.",
		},
	},
	error: { state: "error", issue: null },
} satisfies Record<string, TrackingStatus>;

const noop = () => undefined;
const resolve = () => Promise.resolve();

interface Scenario {
	id: string;
	next: string | null;
	render: () => ReactNode;
	step: 1 | 2 | 3;
	title: string;
}

function FinishScenario({
	initialIntent = null,
	research: state,
	review = null,
	saveError = null,
}: {
	initialIntent?: OnboardingIntent | null;
	research: OnboardingResearch;
	review?: FinishReview | null;
	saveError?: string | null;
}) {
	const [priority, setPriority] = useState(
		INTENT_OPTIONS.find((option) => option.id === initialIntent)?.priority ?? ""
	);
	const [intent, setIntent] = useState<OnboardingIntent | null>(initialIntent);
	return (
		<StepFinish
			intent={intent}
			onChangeIntent={setIntent}
			onChangePriority={setPriority}
			onStartResearch={noop}
			priority={priority}
			research={state}
			review={review}
			saveError={saveError}
			websiteName={WEBSITE.name}
		/>
	);
}

function install(tracking: TrackingStatus, state: OnboardingResearch) {
	return (
		<StepInstall
			domain={WEBSITE.domain}
			research={state}
			tracking={tracking}
			websiteId={WEBSITE.id}
		/>
	);
}

const SCENARIOS: Scenario[] = [
	{
		id: "website",
		step: 1,
		title: "Empty form",
		next: null,
		render: () => <StepWebsite onCreate={resolve} pending={false} />,
	},
	{
		id: "website-creating",
		step: 1,
		title: "Creating",
		next: null,
		render: () => <StepWebsite onCreate={resolve} pending />,
	},
	{
		id: "install-reading-start",
		step: 2,
		title: "Reading starts",
		next: "Skip for now",
		render: () => install(TRACKING.awaiting, RESEARCH.readingStart),
	},
	{
		id: "install-reading",
		step: 2,
		title: "Reading, pages found",
		next: "Skip for now",
		render: () => install(TRACKING.awaiting, RESEARCH.reading),
	},
	{
		id: "install-writing",
		step: 2,
		title: "Writing the brief",
		next: "Skip for now",
		render: () => install(TRACKING.awaiting, RESEARCH.writing),
	},
	{
		id: "install-brief-ready",
		step: 2,
		title: "Brief ready, waiting for events",
		next: "Skip for now",
		render: () => install(TRACKING.awaiting, RESEARCH.ready),
	},
	{
		id: "install-no-ai",
		step: 2,
		title: "No AI available",
		next: "Skip for now",
		render: () => install(TRACKING.awaiting, RESEARCH.unavailable),
	},
	{
		id: "install-issue",
		step: 2,
		title: "Blocked origin",
		next: "Skip for now",
		render: () => install(TRACKING.issue, RESEARCH.ready),
	},
	{
		id: "install-error",
		step: 2,
		title: "Check failed",
		next: "Skip for now",
		render: () => install(TRACKING.error, RESEARCH.failed),
	},
	{
		id: "install-verified",
		step: 2,
		title: "Verified",
		next: "Continue",
		render: () => install(TRACKING.verified, RESEARCH.ready),
	},
	{
		id: "finish-ready",
		step: 3,
		title: "Brief ready",
		next: "Open Insights",
		render: () => <FinishScenario research={RESEARCH.ready} />,
	},
	{
		id: "finish-ready-answered",
		step: 3,
		title: "Brief ready, intent picked",
		next: "Open Insights",
		render: () => (
			<FinishScenario initialIntent="conversions" research={RESEARCH.ready} />
		),
	},
	{
		id: "finish-writing",
		step: 3,
		title: "Still writing",
		next: "Open dashboard",
		render: () => <FinishScenario research={RESEARCH.writing} />,
	},
	{
		id: "finish-reading",
		step: 3,
		title: "Still reading",
		next: "Open dashboard",
		render: () => <FinishScenario research={RESEARCH.reading} />,
	},
	{
		id: "finish-idle",
		step: 3,
		title: "Not started",
		next: "Open dashboard",
		render: () => <FinishScenario research={RESEARCH.idle} />,
	},
	{
		id: "finish-no-ai",
		step: 3,
		title: "No AI available",
		next: "Open dashboard",
		render: () => <FinishScenario research={RESEARCH.unavailable} />,
	},
	{
		id: "finish-failed",
		step: 3,
		title: "Research failed",
		next: "Open dashboard",
		render: () => <FinishScenario research={RESEARCH.failed} />,
	},
	{
		id: "finish-checking-insights",
		step: 3,
		title: "Checking Insights",
		next: "Checking Insights",
		render: () => (
			<FinishScenario
				research={RESEARCH.ready}
				review={{ error: false, loading: true, onRetry: noop }}
			/>
		),
	},
	{
		id: "finish-insights-failed",
		step: 3,
		title: "Insights check failed",
		next: "Open dashboard",
		render: () => (
			<FinishScenario
				research={RESEARCH.ready}
				review={{ error: true, loading: false, onRetry: noop }}
			/>
		),
	},
	{
		id: "finish-save-error",
		step: 3,
		title: "Save failed",
		next: "Open Insights",
		render: () => (
			<FinishScenario
				initialIntent="traffic"
				research={RESEARCH.ready}
				saveError="A newer brief was saved. Review the update before saving your edits."
			/>
		),
	},
];

const STEP_TITLES = ["Website", "Install tracking", "Finish"];

function PreviewPage() {
	const [scenarioId, setScenarioId] = useQueryState(
		"scenario",
		parseAsString.withDefault(SCENARIOS[0]?.id ?? "")
	);
	const scenario =
		SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
	if (!scenario) {
		return null;
	}

	return (
		<div className="flex h-full min-h-0">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Onboarding preview</h1>
			</TopBar.Title>
			<aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-border border-r bg-sidebar">
				<p className="px-4 pt-4 pb-2 text-muted-foreground text-xs">
					Every stage with sample data. Actions do nothing here.
				</p>
				{STEP_TITLES.map((title, index) => (
					<div className="px-2 pb-2" key={title}>
						<p className="px-2 py-1.5 font-semibold text-[11px] text-muted-foreground uppercase">
							{index + 1}. {title}
						</p>
						<ul>
							{SCENARIOS.filter((item) => item.step === index + 1).map(
								(item) => (
									<li key={item.id}>
										<Button
											aria-current={
												item.id === scenario.id ? "page" : undefined
											}
											className={cn(
												"w-full justify-start font-normal",
												item.id === scenario.id &&
													"bg-sidebar-accent font-medium text-sidebar-accent-foreground"
											)}
											onClick={() => setScenarioId(item.id)}
											size="sm"
											variant="ghost"
										>
											{item.title}
										</Button>
									</li>
								)
							)}
						</ul>
					</div>
				))}
			</aside>
			<div className="min-w-0 flex-1 overflow-hidden">
				<OnboardingShell
					back={scenario.step === 3 ? noop : null}
					key={scenario.id}
					next={
						scenario.next
							? {
									label: scenario.next,
									onClick: noop,
									disabled: scenario.next === "Checking Insights",
									loading: scenario.next === "Checking Insights",
								}
							: null
					}
					onSkip={noop}
					step={scenario.step}
				>
					{scenario.render()}
				</OnboardingShell>
			</div>
		</div>
	);
}

export default function OnboardingPreviewPage() {
	if (process.env.NODE_ENV === "production" && !isDashboardE2E) {
		notFound();
	}
	return (
		<Suspense fallback={null}>
			<PreviewPage />
		</Suspense>
	);
}

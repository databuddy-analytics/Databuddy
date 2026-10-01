"use client";

import type { OnboardingIntent } from "@databuddy/shared/custom-events";
import { Button } from "@databuddy/ui";
import { notFound } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { cn } from "@/lib/utils";
import type { AgentProgress, TrackingStatus } from "../_components/connect-app";
import {
	SetupChecklist,
	type SetupChecklistProps,
	type SetupWebsite,
} from "../_components/setup-checklist";
import {
	EMPTY_RESEARCH,
	type OnboardingResearch,
} from "../_components/use-onboarding-research";
import { INTENT_OPTIONS } from "../_components/what-matters";

const WEBSITE: SetupWebsite = {
	id: "preview-website-id",
	domain: "acme.com",
	name: "Acme",
};

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
		sources: [
			{ url: "https://acme.com/", title: "Acme" },
			{ url: "https://acme.com/pricing", title: "Pricing" },
			{ url: "https://acme.com/integrations", title: "Integrations" },
		],
		detectedTools: ["plausible"],
		suggestedGoals: [
			{
				name: "Trial started",
				type: "EVENT",
				target: "trial_started",
				reason: "The 14-day trial is the decision point on every plan.",
			},
			{
				name: "Pricing viewed",
				type: "PAGE_VIEW",
				target: "/pricing",
				reason: "Pricing is the clearest intent signal on the site.",
			},
		],
		suggestedFunnels: [
			{
				name: "Homepage to trial",
				reason: "Shows where visitors drop before starting a trial.",
				steps: [
					{ name: "Homepage", type: "PAGE_VIEW", target: "/" },
					{ name: "Pricing", type: "PAGE_VIEW", target: "/pricing" },
					{ name: "Trial started", type: "EVENT", target: "trial_started" },
				],
			},
		],
	}),
	failed: research("failed", {
		pagesRead: 1,
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

type Sample = Partial<
	Pick<
		SetupChecklistProps,
		| "agentProgress"
		| "finish"
		| "prioritySaved"
		| "research"
		| "saveError"
		| "saving"
		| "tracking"
		| "trackingCopied"
		| "trackingSkipped"
		| "website"
	>
> & { intent?: OnboardingIntent | null };

interface Scenario {
	id: string;
	sample: Sample;
	title: string;
}

const FINISH = {
	dashboard: { label: "Open dashboard", onClick: noop },
	insights: {
		label: "Open Insights",
		onClick: noop,
		note: "Your first review runs once there is enough history to compare.",
	},
	checking: {
		label: "Checking Insights",
		onClick: noop,
		disabled: true,
		loading: true,
	},
	failed: {
		label: "Open dashboard",
		onClick: noop,
		note: "We couldn't check Insights.",
		onRetry: noop,
	},
};

const SCENARIOS: Scenario[] = [
	{ id: "empty", title: "New account", sample: { website: null } },
	{
		id: "created",
		title: "Reading starts",
		sample: { research: RESEARCH.readingStart, finish: FINISH.dashboard },
	},
	{
		id: "reading",
		title: "Reading, pages found",
		sample: { research: RESEARCH.reading, finish: FINISH.dashboard },
	},
	{
		id: "copied",
		title: "Prompt copied, waiting for events",
		sample: {
			research: RESEARCH.writing,
			trackingCopied: true,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "agent-working",
		title: "Agent reporting progress",
		sample: {
			research: RESEARCH.ready,
			trackingCopied: true,
			agentProgress: {
				agent: "claude",
				status: "partial",
				framework: "nextjs",
				steps: ["detect", "install", "mount"],
				issues: [],
				errorMessage: null,
			} satisfies AgentProgress,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "agent-failed",
		title: "Agent hit a problem",
		sample: {
			research: RESEARCH.ready,
			trackingCopied: true,
			agentProgress: {
				agent: "cursor",
				status: "failed",
				framework: "nextjs",
				steps: ["detect", "install"],
				issues: [
					{
						code: "csp",
						message: "The Content Security Policy blocks cdn.databuddy.cc.",
						resolved: false,
					},
				],
				errorMessage: null,
			} satisfies AgentProgress,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "brief-ready",
		title: "Brief ready, waiting for events",
		sample: {
			research: RESEARCH.ready,
			trackingCopied: true,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "blocked",
		title: "Blocked origin",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.issue,
			trackingCopied: true,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "check-error",
		title: "Tracking check failed",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.error,
			trackingCopied: true,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "skipped",
		title: "Tracking skipped",
		sample: {
			research: RESEARCH.ready,
			trackingSkipped: true,
			finish: FINISH.dashboard,
		},
	},
	{
		id: "no-ai",
		title: "No AI available",
		sample: { research: RESEARCH.unavailable, finish: FINISH.dashboard },
	},
	{
		id: "research-idle",
		title: "Existing site, not read yet",
		sample: { research: RESEARCH.idle, finish: FINISH.dashboard },
	},
	{
		id: "research-failed",
		title: "Research failed",
		sample: { research: RESEARCH.failed, finish: FINISH.dashboard },
	},
	{
		id: "verified",
		title: "Verified, answer pending",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			finish: FINISH.insights,
		},
	},
	{
		id: "intent",
		title: "Intent picked",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			intent: "conversions",
			finish: FINISH.insights,
		},
	},
	{
		id: "save-error",
		title: "Save failed",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			intent: "traffic",
			saveError:
				"A newer brief was saved. Review the update before saving your edits.",
			finish: FINISH.insights,
		},
	},
	{
		id: "all-done",
		title: "Everything done",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			prioritySaved: true,
			finish: FINISH.insights,
		},
	},
	{
		id: "checking-insights",
		title: "Checking Insights",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			prioritySaved: true,
			finish: FINISH.checking,
		},
	},
	{
		id: "insights-failed",
		title: "Insights check failed",
		sample: {
			research: RESEARCH.ready,
			tracking: TRACKING.verified,
			prioritySaved: true,
			finish: FINISH.failed,
		},
	},
];

function Sample({ sample }: { sample: Sample }) {
	const [priority, setPriority] = useState(
		INTENT_OPTIONS.find((option) => option.id === sample.intent)?.priority ?? ""
	);
	const website = sample.website === undefined ? WEBSITE : sample.website;
	return (
		<SetupChecklist
			agentProgress={sample.agentProgress ?? null}
			creating={false}
			loadingWebsites={false}
			finish={website ? (sample.finish ?? null) : null}
			onChangePriority={setPriority}
			onCreateWebsite={() => Promise.resolve()}
			onSavePriority={noop}
			onSkipSetup={noop}
			onSkipTracking={noop}
			onStartResearch={noop}
			suggestions={{
				created: new Set(["goal:Pricing viewed"]),
				creating: null,
				onCreate: noop,
			}}
			priority={priority}
			prioritySaved={sample.prioritySaved ?? false}
			research={sample.research ?? EMPTY_RESEARCH}
			saveError={sample.saveError ?? null}
			saving={sample.saving ?? false}
			setupSession="previewsession0000"
			suggestedDomain={website ? null : "acme.com"}
			tracking={sample.tracking ?? TRACKING.awaiting}
			trackingCopied={sample.trackingCopied ?? false}
			trackingSkipped={sample.trackingSkipped ?? false}
			website={website}
		/>
	);
}

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
			<aside className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-border border-r bg-sidebar p-2">
				<p className="px-2 pt-2 pb-2 text-muted-foreground text-xs">
					Every state with sample data. Actions do nothing here.
				</p>
				{SCENARIOS.map((item) => (
					<Button
						aria-current={item.id === scenario.id ? "page" : undefined}
						className={cn(
							"w-full justify-start font-normal",
							item.id === scenario.id &&
								"bg-sidebar-accent font-medium text-sidebar-accent-foreground"
						)}
						key={item.id}
						onClick={() => setScenarioId(item.id)}
						size="sm"
						variant="ghost"
					>
						{item.title}
					</Button>
				))}
			</aside>
			<div className="min-w-0 flex-1 overflow-hidden">
				<Sample key={scenario.id} sample={scenario.sample} />
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

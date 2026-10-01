"use client";

import { Button, Card, Progress } from "@databuddy/ui";
import { useState } from "react";
import { AddWebsite, type WebsiteFormValues } from "./add-website";
import {
	type AgentProgress,
	agentProgressSummary,
	ConnectApp,
	type TrackingCopyMethod,
	type TrackingStatus,
} from "./connect-app";
import {
	ReadSite,
	type ReadSiteSuggestions,
	readSiteDetail,
} from "./read-site";
import { SetupRow, type SetupRowStatus } from "./setup-row";
import type { OnboardingResearch } from "./use-onboarding-research";
import { WhatMatters } from "./what-matters";

export interface SetupWebsite {
	domain: string;
	id: string;
	name: string;
}

export interface SetupChecklistProps {
	agentProgress: AgentProgress | null;
	creating: boolean;
	finish: {
		disabled?: boolean;
		label: string;
		loading?: boolean;
		note?: string | null;
		onClick: () => void;
		onRetry?: () => void;
	} | null;
	onChangePriority: (value: string) => void;
	onCopy?: (method: TrackingCopyMethod, agent?: string) => void;
	onCreateWebsite: (values: WebsiteFormValues) => Promise<void>;
	onSavePriority: () => void;
	onSkipSetup: () => void;
	onSkipTracking: () => void;
	onStartResearch: () => void;
	priority: string;
	prioritySaved: boolean;
	research: OnboardingResearch;
	saveError: string | null;
	saving: boolean;
	setupSession: string;
	suggestions: ReadSiteSuggestions;
	tracking: TrackingStatus;
	trackingCopied: boolean;
	trackingSkipped: boolean;
	website: SetupWebsite | null;
}

type RowId = "website" | "connect" | "read" | "matters";

export function SetupChecklist(props: SetupChecklistProps) {
	const { research, tracking, website } = props;

	const websiteStatus: SetupRowStatus = website ? "done" : "active";
	const readingNow =
		research.phase === "reading" || research.phase === "writing";
	const connectStatus: SetupRowStatus = website
		? tracking.state === "verified"
			? "done"
			: props.trackingSkipped
				? "skipped"
				: props.trackingCopied
					? "waiting"
					: readingNow
						? "pending"
						: "active"
		: "pending";
	const readStatus: SetupRowStatus = website
		? readingNow
			? "waiting"
			: research.phase === "ready"
				? "done"
				: research.phase === "failed" || research.phase === "unavailable"
					? "skipped"
					: research.canStart
						? "active"
						: "pending"
		: "pending";
	const mattersStatus: SetupRowStatus = website
		? props.prioritySaved
			? "done"
			: "active"
		: "pending";

	const rows: { id: RowId; status: SetupRowStatus }[] = [
		{ id: "website", status: websiteStatus },
		{ id: "read", status: readStatus },
		{ id: "connect", status: connectStatus },
		{ id: "matters", status: mattersStatus },
	];
	const focus = rows.find((row) => row.status === "active")?.id ?? null;
	const doneCount = rows.filter((row) => row.status === "done").length;
	const [open, setOpen] = useState<RowId | null>(focus);
	const [lastFocus, setLastFocus] = useState(focus);
	if (focus !== lastFocus) {
		setLastFocus(focus);
		setOpen(focus);
	}
	const toggle = (id: RowId) => () =>
		setOpen((current) => (current === id ? null : id));

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
				<div className="mb-4 flex items-center justify-between gap-3">
					<h1 className="font-semibold text-xl">
						Set up {website?.name ?? "Databuddy"}
					</h1>
					<Button onClick={props.onSkipSetup} size="sm" variant="ghost">
						Skip setup
					</Button>
				</div>
				<Card className="gap-0 py-0">
					<Card.Header className="gap-3 border-border border-b bg-card px-5 py-4">
						<Card.Title>Your first review, in four steps</Card.Title>
						<Progress size="sm" value={(doneCount / rows.length) * 100} />
					</Card.Header>

					<SetupRow
						detail={website?.domain}
						expanded={open === "website"}
						onToggle={website ? undefined : toggle("website")}
						status={websiteStatus}
						title="Add your website"
					>
						{website ? null : (
							<AddWebsite
								onCreate={props.onCreateWebsite}
								pending={props.creating}
							/>
						)}
					</SetupRow>

					<SetupRow
						detail={readSiteDetail(research)}
						expanded={open === "read"}
						onToggle={
							website && research.phase !== "unavailable"
								? toggle("read")
								: undefined
						}
						status={readStatus}
						title="We read your site"
					>
						{website ? (
							<ReadSite
								onStart={props.onStartResearch}
								research={research}
								suggestions={props.suggestions}
								websiteId={website.id}
							/>
						) : null}
					</SetupRow>

					<SetupRow
						detail={
							tracking.state === "verified"
								? "Tracking verified"
								: props.trackingSkipped
									? "Skipped"
									: props.agentProgress
										? agentProgressSummary(props.agentProgress)
										: props.trackingCopied && website
											? `Waiting for the first page view from ${website.domain}`
											: readingNow
												? "Ready once the brief is"
												: undefined
						}
						expanded={open === "connect"}
						onToggle={website ? toggle("connect") : undefined}
						status={connectStatus}
						title="Connect your app"
					>
						{website ? (
							<ConnectApp
								agentProgress={props.agentProgress}
								domain={website.domain}
								onCopy={props.onCopy}
								onSkip={props.onSkipTracking}
								research={research}
								setupSession={props.setupSession}
								tracking={tracking}
								websiteId={website.id}
							/>
						) : null}
					</SetupRow>

					<SetupRow
						detail={props.prioritySaved ? "Saved" : undefined}
						expanded={open === "matters"}
						onToggle={website ? toggle("matters") : undefined}
						status={mattersStatus}
						title="What matters to you"
					>
						<WhatMatters
							onChangePriority={props.onChangePriority}
							onSave={props.onSavePriority}
							priority={props.priority}
							research={research}
							saveError={props.saveError}
							saved={props.prioritySaved}
							saving={props.saving}
						/>
					</SetupRow>

					{props.finish ? (
						<Card.Footer className="flex-wrap justify-between gap-3 border-border border-t px-5 py-4">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								{props.finish.note ? <p>{props.finish.note}</p> : null}
								{props.finish.onRetry ? (
									<Button
										onClick={props.finish.onRetry}
										size="sm"
										variant="secondary"
									>
										Try again
									</Button>
								) : null}
							</div>
							<Button
								disabled={props.finish.disabled}
								loading={props.finish.loading}
								onClick={props.finish.onClick}
							>
								{props.finish.label}
							</Button>
						</Card.Footer>
					) : null}
				</Card>
			</div>
		</div>
	);
}

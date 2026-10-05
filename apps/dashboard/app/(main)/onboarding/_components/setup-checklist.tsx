"use client";

import type { OnboardingWant } from "@databuddy/shared/custom-events";
import { Button, Card, Progress } from "@databuddy/ui";
import { GlobeIcon } from "@databuddy/ui/icons";
import { useState } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { AddWebsite, type WebsiteFormValues } from "./add-website";
import {
	type AgentProgress,
	agentProgressSummary,
	ConnectApp,
	type TrackingCopyMethod,
	type TrackingStatus,
} from "@/components/websites/connect-app";
import {
	ReadSite,
	type ReadSiteSuggestions,
	readSiteDetail,
} from "./read-site";
import { SetupRow, type SetupRowStatus } from "@/components/websites/setup-row";
import type { SiteResearch } from "@/hooks/use-site-research";

export interface SetupWebsite {
	domain: string;
	id: string;
	name: string;
}

export interface ProductSetup {
	linksCreated: boolean;
	mcpCopied: boolean;
	monitor: { blockedRole: string | null; creating: boolean; exists: boolean };
	onCopyMcp: () => void;
	onCreateApiKey: () => void;
	onCreateLink: () => void;
	onCreateMonitor: () => void;
	onEditMonitor: () => void;
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
	loadingWebsites: boolean;
	onChangeWants: () => void;
	onCopy?: (method: TrackingCopyMethod, agent?: string) => void;
	onCreateWebsite: (values: WebsiteFormValues) => Promise<void>;
	onSkipSetup: () => void;
	onSkipTracking: () => void;
	onStartResearch: () => void;
	products: ProductSetup;
	research: SiteResearch;
	setupSession: string;
	suggestedDomain: string | null;
	suggestions: ReadSiteSuggestions;
	tracking: TrackingStatus;
	trackingCopied: boolean;
	trackingSkipped: boolean;
	wants: OnboardingWant[];
	website: SetupWebsite | null;
}

type RowId = "website" | "connect" | "read" | "uptime" | "links" | "mcp";

const STEP_COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six"];

export function SetupChecklist(props: SetupChecklistProps) {
	const { products, research, tracking, wants, website } = props;

	const websiteStatus: SetupRowStatus = website
		? "done"
		: props.loadingWebsites
			? "pending"
			: "active";
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
	const uptimeStatus: SetupRowStatus = website
		? products.monitor.exists
			? "done"
			: products.monitor.blockedRole
				? "skipped"
				: "active"
		: "pending";
	const linksStatus: SetupRowStatus = products.linksCreated ? "done" : "active";
	const mcpStatus: SetupRowStatus = products.mcpCopied ? "done" : "active";

	const rows: { id: RowId; status: SetupRowStatus }[] = [
		{ id: "website", status: websiteStatus },
		{ id: "read", status: readStatus },
		{ id: "connect", status: connectStatus },
		...(wants.includes("uptime")
			? [{ id: "uptime" as const, status: uptimeStatus }]
			: []),
		...(wants.includes("links")
			? [{ id: "links" as const, status: linksStatus }]
			: []),
		...(wants.includes("mcp")
			? [{ id: "mcp" as const, status: mcpStatus }]
			: []),
	];
	const focus = rows.find((row) => row.status === "active")?.id ?? null;
	const doneCount = rows.filter((row) => row.status === "done").length;
	const [open, setOpen] = useState<RowId | null>(focus);
	const [lastFocus, setLastFocus] = useState(focus);
	if (focus !== lastFocus) {
		setLastFocus(focus);
		// A row that is still working (agent progress, reading) stays open.
		if (rows.find((row) => row.id === open)?.status !== "waiting") {
			setOpen(focus);
		}
	}
	const toggle = (id: RowId) => () =>
		setOpen((current) => (current === id ? null : id));

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
				<div className="mb-4 flex items-center justify-between gap-3">
					<h1 className="flex items-center gap-2.5 font-semibold text-xl">
						{website ? (
							<FaviconImage
								altText=""
								className="size-6"
								domain={website.domain}
								fallbackIcon={
									<GlobeIcon
										className="absolute inset-0 m-auto text-muted-foreground"
										size={16}
									/>
								}
								size={24}
							/>
						) : null}
						Set up {website?.name ?? "Databuddy"}
					</h1>
					<div className="flex items-center gap-1">
						<Button onClick={props.onChangeWants} size="sm" variant="ghost">
							Change picks
						</Button>
						<Button onClick={props.onSkipSetup} size="sm" variant="ghost">
							Skip setup
						</Button>
					</div>
				</div>
				<Card className="gap-0 py-0">
					<Card.Header className="gap-3 border-border border-b bg-card px-5 py-4">
						<Card.Title>
							Your first review, in {STEP_COUNT_WORDS[rows.length]} steps
						</Card.Title>
						<Progress size="sm" value={(doneCount / rows.length) * 100} />
					</Card.Header>

					<SetupRow
						detail={website?.domain}
						expanded={open === "website"}
						onToggle={website ? undefined : toggle("website")}
						status={websiteStatus}
						title="Add your website"
					>
						{website || props.loadingWebsites ? null : (
							<AddWebsite
								onCreate={props.onCreateWebsite}
								pending={props.creating}
								suggestedDomain={props.suggestedDomain}
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
								wants={wants}
								websiteId={website.id}
							/>
						) : null}
					</SetupRow>

					{wants.includes("uptime") ? (
						<SetupRow
							detail={
								products.monitor.exists
									? "Checked every 10 minutes"
									: products.monitor.blockedRole
										? "Needs an owner or admin"
										: undefined
							}
							expanded={open === "uptime"}
							onToggle={website ? toggle("uptime") : undefined}
							status={uptimeStatus}
							title={`Watch ${website?.domain ?? "your site"} for downtime`}
						>
							{website ? (
								<div className="flex flex-wrap items-center justify-between gap-3">
									<p className="max-w-md text-pretty text-muted-foreground text-sm">
										{products.monitor.exists
											? `https://${website.domain} is checked every 10 minutes. Edit the monitor to change the interval or add alerts.`
											: products.monitor.blockedRole
												? `Your ${products.monitor.blockedRole} role can't create monitors. Ask an owner or admin to start monitoring ${website.domain}.`
												: `Databuddy checks https://${website.domain} every 10 minutes and records every outage.`}
									</p>
									{products.monitor.exists ? (
										<Button
											onClick={products.onEditMonitor}
											size="sm"
											variant="secondary"
										>
											Edit monitor
										</Button>
									) : products.monitor.blockedRole ? null : (
										<Button
											loading={products.monitor.creating}
											onClick={products.onCreateMonitor}
											size="sm"
										>
											Start monitoring
										</Button>
									)}
								</div>
							) : null}
						</SetupRow>
					) : null}

					{wants.includes("links") ? (
						<SetupRow
							detail={products.linksCreated ? "First link created" : undefined}
							expanded={open === "links"}
							onToggle={toggle("links")}
							status={linksStatus}
							title="Make your first short link"
						>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="max-w-md text-pretty text-muted-foreground text-sm">
									Shorten a link for a campaign or a post and see every click
									with its source, country, and device.
								</p>
								<Button
									onClick={products.onCreateLink}
									size="sm"
									variant={products.linksCreated ? "secondary" : "primary"}
								>
									{products.linksCreated ? "Create another" : "Create a link"}
								</Button>
							</div>
						</SetupRow>
					) : null}

					{wants.includes("mcp") ? (
						<SetupRow
							detail={products.mcpCopied ? "Prompt copied" : undefined}
							expanded={open === "mcp"}
							onToggle={toggle("mcp")}
							status={mcpStatus}
							title="Track your MCP server"
						>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="max-w-md text-pretty text-muted-foreground text-sm">
									Send this prompt to the coding agent working on your MCP
									server. It wraps the server once and reads an API key from
									DATABUDDY_API_KEY.
								</p>
								<div className="flex items-center gap-2">
									<Button
										onClick={products.onCreateApiKey}
										size="sm"
										variant="secondary"
									>
										Create API key
									</Button>
									<Button onClick={products.onCopyMcp} size="sm">
										{products.mcpCopied ? "Copied" : "Copy prompt"}
									</Button>
								</div>
							</div>
						</SetupRow>
					) : null}

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

"use client";

import type { OnboardingWant } from "@databuddy/shared/custom-events";
import { Button, StatusDot } from "@databuddy/ui";
import { Tabs } from "@databuddy/ui/client";
import {
	CaretRightIcon,
	CheckIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { useMemo, useState } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import html from "shiki/langs/html.mjs";
import tsx from "shiki/langs/tsx.mjs";
import vue from "shiki/langs/vue.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
	CODING_AGENTS,
	COPY_SUCCESS_TIMEOUT,
} from "@/app/(main)/websites/[id]/_components/constants/settings-constants";
import {
	generateAgentPrompt,
	generateNpmCode,
	generateScriptTag,
	generateVueCode,
} from "@/app/(main)/websites/[id]/_components/utils/code-generators";
import type { SiteResearch } from "@/hooks/use-site-research";
import { RECOMMENDED_DEFAULTS } from "@/app/(main)/websites/[id]/_components/utils/tracking-defaults";

function agentName(id: string): string {
	return CODING_AGENTS.find((agent) => agent.id === id)?.name ?? id;
}

const highlighter = createHighlighterCoreSync({
	themes: [vesper],
	langs: [html, tsx, vue],
	engine: createJavaScriptRegexEngine(),
});

export type TrackingCopyMethod = "ai" | "script" | "sdk";

export interface TrackingStatus {
	issue: { fix: string; message: string } | null;
	state: "awaiting" | "error" | "verified";
}

export interface AgentProgress {
	agent: string;
	errorMessage: string | null;
	framework: string | null;
	issues: { code: string; message: string; resolved: boolean }[];
	status: "failed" | "partial" | "success";
	steps: string[];
}

const FRAMEWORK_NAMES: Record<string, string> = {
	nextjs: "Next.js",
	react: "React",
	vue: "Vue",
	nuxt: "Nuxt",
	astro: "Astro",
	svelte: "Svelte",
	vanilla: "plain HTML",
};

function agentStepLabel(step: string, progress: AgentProgress): string {
	switch (step) {
		case "detect":
			return progress.framework
				? `Detected ${FRAMEWORK_NAMES[progress.framework] ?? progress.framework}`
				: "Detected the framework";
		case "install":
			return "Installed @databuddy/sdk";
		case "mount":
			return "Mounted the tracker";
		case "env-var":
			return "Added the client ID env var";
		case "verify":
			return "Verified events";
		default:
			return step;
	}
}

export function agentProgressSummary(progress: AgentProgress): string {
	const agent = agentName(progress.agent);
	if (progress.status === "failed") {
		return `${agent} ran into a problem`;
	}
	if (progress.status === "success") {
		return `${agent} finished the install`;
	}
	const last = progress.steps.at(-1);
	return last ? agentStepLabel(last, progress) : `${agent} is working`;
}

interface ConnectAppProps {
	agentProgress: AgentProgress | null;
	domain: string;
	/** Hide "Or install it yourself" when the page has its own install section. */
	manualInstall?: boolean;
	onCopy?: (method: TrackingCopyMethod, agent?: string) => void;
	onSkip?: () => void;
	/** Offered when the organization has no brief yet, so the prompt can learn the site first. */
	onStartResearch?: () => void;
	research: SiteResearch;
	setupSession: string;
	tracking: TrackingStatus;
	/** What the team picked in onboarding; the prompt turns these into requirements. */
	wants?: OnboardingWant[];
	websiteId: string;
}

export function ConnectApp({
	agentProgress,
	domain,
	onCopy,
	onSkip,
	research,
	setupSession,
	manualInstall = true,
	onStartResearch,
	tracking,
	wants,
	websiteId,
}: ConnectAppProps) {
	const [copied, setCopied] = useState<string | null>(null);
	const [scriptOpen, setScriptOpen] = useState(false);
	const snippets = useMemo(
		() =>
			[
				[
					"script",
					"Script tag",
					"html",
					generateScriptTag(websiteId, RECOMMENDED_DEFAULTS),
				],
				[
					"react",
					"React",
					"tsx",
					generateNpmCode(websiteId, RECOMMENDED_DEFAULTS),
				],
				["vue", "Vue", "vue", generateVueCode(websiteId, RECOMMENDED_DEFAULTS)],
			].map(([id, label, lang, code]) => ({
				id,
				label,
				code,
				html: highlighter.codeToHtml(code, { lang, theme: "vesper" }),
			})),
		[websiteId]
	);

	const hint =
		research.phase === "reading" || research.phase === "writing"
			? `Databunny is still reading ${domain}. Once the brief is ready the prompt also names the events and funnels this site needs.`
			: research.phase === "ready" &&
					research.suggestedGoals.length + research.suggestedFunnels.length > 0
				? "The prompt includes the brief and the events behind the suggested goals and funnels."
				: null;

	const copy = async (id: string, method: TrackingCopyMethod) => {
		const text =
			method === "ai"
				? generateAgentPrompt(
						websiteId,
						setupSession,
						research.phase === "ready"
							? {
									brief: research.content,
									goals: research.suggestedGoals,
									funnels: research.suggestedFunnels,
									wants,
								}
							: { wants }
					)
				: (snippets.find((snippet) => snippet.id === id)?.code ?? "");
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			toast.error("Failed to copy", {
				description: "Select the text and copy it manually.",
			});
			return;
		}
		setCopied(id);
		setTimeout(() => setCopied(null), COPY_SUCCESS_TIMEOUT);
		onCopy?.(method, method === "ai" ? id : undefined);
	};

	return (
		<div className="space-y-5">
			<div className="space-y-2.5">
				<p className="text-pretty text-sm">
					Pick your coding agent to copy a setup prompt. Paste it in and it
					installs Databuddy for you.
				</p>
				{research.phase === "idle" && research.canStart && onStartResearch ? (
					<p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
						<span className="text-pretty">
							Let Databunny read {domain} first and the prompt will name your
							pages and events.
						</span>
						<Button
							className="-mx-2.5"
							onClick={onStartResearch}
							size="sm"
							variant="ghost"
						>
							Read my site
						</Button>
					</p>
				) : hint ? (
					<p className="text-pretty text-muted-foreground text-xs">{hint}</p>
				) : null}
				<div className="flex flex-wrap gap-2">
					{CODING_AGENTS.map((agent) => (
						<Button
							className="border border-border bg-background hover:bg-accent"
							key={agent.id}
							onClick={() => copy(agent.id, "ai")}
							size="sm"
							variant="ghost"
						>
							{copied === agent.id ? (
								<CheckIcon className="size-4 text-success" />
							) : (
								<img
									alt=""
									className={cn("size-4", agent.invert && "dark:invert")}
									height={16}
									src={`/ai/${agent.icon}.svg`}
									width={16}
								/>
							)}
							{agent.name}
						</Button>
					))}
				</div>
			</div>

			{manualInstall ? (
				<div>
					<Button
						className="-ml-2.5"
						onClick={() => setScriptOpen((value) => !value)}
						size="sm"
						variant="ghost"
					>
						<CaretRightIcon
							className={cn(
								"size-3 transition-transform duration-150",
								scriptOpen && "rotate-90"
							)}
						/>
						Or install it yourself
					</Button>
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
							scriptOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
						)}
					>
						<div className="min-h-0 overflow-hidden">
							<Tabs className="mt-3 w-full" defaultValue="script">
								<Tabs.List>
									{snippets.map((snippet) => (
										<Tabs.Tab key={snippet.id} value={snippet.id}>
											{snippet.label}
										</Tabs.Tab>
									))}
								</Tabs.List>
								{snippets.map((snippet) => (
									<Tabs.Panel
										className="mt-3"
										key={snippet.id}
										value={snippet.id}
									>
										<div className="group relative overflow-hidden rounded border border-border">
											<div
												className={cn(
													"overflow-x-auto font-mono text-[13px] leading-relaxed",
													"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
													"[&>pre>code]:block [&>pre>code]:w-full"
												)}
												dangerouslySetInnerHTML={{ __html: snippet.html }}
											/>
											<Button
												className="absolute top-2 right-2"
												onClick={() =>
													copy(
														snippet.id,
														snippet.id === "script" ? "script" : "sdk"
													)
												}
												size="sm"
												variant="secondary"
											>
												{copied === snippet.id ? "Copied" : "Copy"}
											</Button>
										</div>
									</Tabs.Panel>
								))}
							</Tabs>
						</div>
					</div>
				</div>
			) : null}

			{agentProgress ? (
				<ul className="space-y-1.5 border-border border-t pt-4">
					{agentProgress.steps.map((step) => (
						<li className="flex items-center gap-2 text-sm" key={step}>
							<CheckIcon className="size-3.5 shrink-0 text-success" />
							{agentStepLabel(step, agentProgress)}
						</li>
					))}
					{agentProgress.issues
						.filter((issue) => !issue.resolved)
						.map((issue) => (
							<li
								className="flex items-start gap-2 text-sm"
								key={`${issue.code}:${issue.message}`}
							>
								<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
								<span className="text-pretty">{issue.message}</span>
							</li>
						))}
					{agentProgress.status === "failed" ? (
						<li className="flex items-start gap-2 text-destructive text-sm">
							<WarningCircleIcon className="mt-0.5 size-3.5 shrink-0" />
							<span className="text-pretty">
								{agentProgress.errorMessage ??
									`${agentName(agentProgress.agent)} could not finish the install.`}
							</span>
						</li>
					) : null}
					{agentProgress.status === "partial" ? (
						<li className="flex items-center gap-2 text-muted-foreground text-sm">
							<StatusDot color="info" pulse size="sm" />
							{agentName(agentProgress.agent)} is still working
						</li>
					) : null}
				</ul>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-4">
				<div className="flex items-start gap-2">
					<StatusDot
						className="mt-1"
						color={
							tracking.state === "verified"
								? "success"
								: tracking.state === "error"
									? "destructive"
									: "warning"
						}
						pulse={tracking.state === "awaiting"}
						size="sm"
					/>
					<p
						className={cn(
							"text-pretty text-xs",
							tracking.state === "error"
								? "text-destructive"
								: "text-muted-foreground"
						)}
					>
						{tracking.state === "verified"
							? "Tracking verified. Page views and sessions are being recorded."
							: tracking.issue
								? `${tracking.issue.message} ${tracking.issue.fix}`
								: tracking.state === "error"
									? "Couldn't check for events. Checking again shortly."
									: `Waiting for the first page view. Open ${domain} to send one.`}
					</p>
				</div>
				{onSkip && tracking.state !== "verified" ? (
					<Button onClick={onSkip} size="sm" variant="ghost">
						Skip for now
					</Button>
				) : null}
			</div>
		</div>
	);
}

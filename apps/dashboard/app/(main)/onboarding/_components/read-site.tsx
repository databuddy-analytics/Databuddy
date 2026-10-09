"use client";

import {
	ANALYTICS_TOOL_LABELS,
	type BusinessSuggestedFunnel,
	type BusinessSuggestedGoal,
} from "@databuddy/shared/organization-business-context";
import { Button } from "@databuddy/ui";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	CheckIcon,
} from "@databuddy/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BusinessContextMarkdown } from "../../organizations/components/business-context-content";
import type { SiteResearch } from "@/hooks/use-site-research";

export function readSiteDetail(research: SiteResearch): string | null {
	const pages = `${research.pagesRead} ${research.pagesRead === 1 ? "page" : "pages"}`;
	switch (research.phase) {
		case "reading":
			return research.pagesRead > 0
				? `Reading ${research.domain} · ${pages} read`
				: `Reading ${research.domain}. Opening the homepage and the pages it links to`;
		case "writing":
			return `Writing a brief about ${research.domain}`;
		case "ready": {
			const suggested =
				research.suggestedGoals.length + research.suggestedFunnels.length;
			return suggested
				? `Read ${pages} · ${suggested} ${suggested === 1 ? "starting point" : "starting points"} below`
				: `Read ${pages} on ${research.domain}`;
		}
		case "failed":
			return `Failed to read ${research.domain}`;
		case "unavailable":
			return "Not available";
		default:
			return null;
	}
}

export function suggestionKey(
	suggestion: BusinessSuggestedFunnel | BusinessSuggestedGoal
): string {
	return `${"steps" in suggestion ? "funnel" : "goal"}:${suggestion.name}`;
}

export interface ReadSiteSuggestions {
	created: ReadonlySet<string>;
	creating: string | null;
	limitNotes: { funnel: string | null; goal: string | null };
	onCreate: (
		suggestion: BusinessSuggestedFunnel | BusinessSuggestedGoal
	) => void;
}

function pathLabel(url: string): string {
	const { pathname } = new URL(url);
	return pathname === "/" ? "Homepage" : pathname;
}

export function ReadSite({
	onStart,
	research,
	suggestions,
	websiteId,
}: {
	onStart: () => void;
	research: SiteResearch;
	suggestions: ReadSiteSuggestions;
	websiteId: string;
}) {
	const [expanded, setExpanded] = useState(false);
	if (research.phase === "idle") {
		return research.canStart ? (
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-pretty text-muted-foreground text-sm">
					Databunny reads {research.domain} and drafts a brief so your first
					insights already know what the business does.
				</p>
				<Button onClick={onStart} size="sm" variant="secondary">
					Read my site
				</Button>
			</div>
		) : null;
	}
	if (research.phase === "failed" || research.phase === "unavailable") {
		return (
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-pretty text-muted-foreground text-sm">
					{research.message ?? "Databunny couldn't read the site."} Your answer
					below does the same job.
				</p>
				{research.canStart ? (
					<Button onClick={onStart} size="sm" variant="secondary">
						Try again
					</Button>
				) : null}
			</div>
		);
	}
	if (!research.content) {
		return null;
	}
	const streaming = research.phase !== "ready";
	const suggested = [
		...research.suggestedGoals.map((goal) => ({
			suggestion: goal,
			label: "Create goal",
			limitNote: suggestions.limitNotes.goal,
			reason: `${goal.type === "PAGE_VIEW" ? "Page view of" : "Event"} ${goal.target}. ${goal.reason}`,
		})),
		...research.suggestedFunnels.map((funnel) => ({
			suggestion: funnel,
			label: "Create funnel",
			limitNote: suggestions.limitNotes.funnel,
			reason: `${funnel.steps.map((step) => step.target).join(" → ")}. ${funnel.reason}`,
		})),
	];
	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div
					className={cn(!(expanded || streaming) && "max-h-40 overflow-hidden")}
				>
					<BusinessContextMarkdown
						content={research.content}
						streaming={streaming}
					/>
				</div>
				{streaming ? null : (
					<div className="flex flex-wrap items-center gap-x-1 gap-y-2">
						<Button
							onClick={() => setExpanded((value) => !value)}
							size="sm"
							variant="secondary"
						>
							<CaretDownIcon
								className={cn(
									"size-3 transition-transform duration-150 ease-in-out",
									expanded && "rotate-180"
								)}
							/>
							{expanded ? "Show less" : "Read the full brief"}
						</Button>
						{research.sources.length ? (
							<span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
								<span>From</span>
								{research.sources.map((source) => (
									<a
										className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
										href={source.url}
										key={source.url}
										rel="noopener noreferrer"
										target="_blank"
										title={source.title}
									>
										{pathLabel(source.url)}
										<ArrowSquareOutIcon className="size-2.5" />
									</a>
								))}
							</span>
						) : null}
					</div>
				)}
			</div>

			{streaming ? null : (
				<>
					{research.detectedTools.map((tool) => {
						const info = ANALYTICS_TOOL_LABELS[tool];
						return (
							<p className="text-pretty text-sm" key={tool}>
								Saw {info.name} on {research.domain}.{" "}
								{info.importProvider ? (
									<Link
										className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
										href={`/websites/${websiteId}/settings/import`}
									>
										Import your history
									</Link>
								) : (
									<span className="text-muted-foreground">
										Databuddy runs alongside it.
									</span>
								)}
							</p>
						);
					})}

					{suggested.length ? (
						<div>
							<p className="font-medium text-sm">Suggested starting points</p>
							<p className="text-muted-foreground text-xs">
								Based on the pages read. Nothing is created until you say so.
							</p>
							<ul className="mt-1 divide-y divide-border">
								{suggested.map(({ suggestion, label, limitNote, reason }) => {
									const key = suggestionKey(suggestion);
									return (
										<li
											className="flex items-center justify-between gap-3 py-2"
											key={key}
										>
											<div className="min-w-0">
												<p className="truncate text-sm">{suggestion.name}</p>
												<p className="text-pretty text-muted-foreground text-xs">
													{reason}
												</p>
											</div>
											{suggestions.created.has(key) ? (
												<span className="flex shrink-0 items-center gap-1 text-success text-xs">
													<CheckIcon className="size-3.5" />
													Created
												</span>
											) : limitNote ? (
												<span className="shrink-0 text-muted-foreground text-xs">
													{limitNote}
												</span>
											) : (
												<Button
													aria-label={`${label} ${suggestion.name}`}
													className="shrink-0"
													loading={suggestions.creating === key}
													onClick={() => suggestions.onCreate(suggestion)}
													size="sm"
													variant="secondary"
												>
													{label}
												</Button>
											)}
										</li>
									);
								})}
							</ul>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}

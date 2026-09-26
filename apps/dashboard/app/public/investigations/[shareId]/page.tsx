"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
	CaseState,
	InvestigationActivity,
} from "@/app/(main)/insights/_components/investigation-row";
import { publicInvestigationMarketingHref } from "@/app/public/public-dashboard-constants";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Branding } from "@/components/logo/branding";
import { orpc } from "@/lib/orpc";
import { CaretDownIcon, LightbulbIcon, PlanetIcon } from "@databuddy/ui/icons";
import {
	Button,
	Card,
	EmptyState,
	formatDateTime,
	Skeleton,
	StatusDot,
} from "@databuddy/ui";

const marketingLinkRel = "noopener noreferrer dofollow" as const;

export default function PublicInvestigationPage() {
	const params = useParams();
	const shareId = typeof params.shareId === "string" ? params.shareId : "";
	const [historyExpanded, setHistoryExpanded] = useState(false);
	const { data, isLoading } = useQuery({
		...orpc.insights.getPublicShare.queryOptions({ input: { shareId } }),
		enabled: shareId.length > 0,
		retry: false,
	});

	const latest = data?.timeline.at(-1) ?? null;
	const visibleItems =
		data && !historyExpanded ? data.timeline.slice(-1) : (data?.timeline ?? []);
	const earlierCount = (data?.timeline.length ?? 0) - 1;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<header className="shrink-0 border-b bg-sidebar">
				<div className="mx-auto flex min-h-16 max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
					<div className="flex min-w-0 items-center gap-3">
						<div className="shrink-0 rounded-lg bg-sidebar-accent p-1.5 ring-1 ring-sidebar-border/50">
							<FaviconImage
								altText={`${data?.insight.websiteName ?? "Website"} favicon`}
								className="size-5"
								domain={data?.insight.websiteDomain ?? ""}
								fallbackIcon={
									<PlanetIcon className="text-sidebar-ring" size={20} />
								}
								size={20}
							/>
						</div>
						<div className="min-w-0">
							{data ? (
								<>
									<h1 className="truncate font-semibold text-sm">
										{data.insight.websiteName ?? data.insight.websiteDomain}
									</h1>
									<p className="truncate text-muted-foreground text-xs">
										Investigation · V{data.version} published{" "}
										{formatDateTime(data.publishedAt)}
									</p>
								</>
							) : (
								<>
									<Skeleton className="h-4 w-32" />
									<Skeleton className="mt-1 h-3 w-40" />
								</>
							)}
						</div>
					</div>
					<a
						aria-label="Databuddy, open marketing site"
						className="flex min-w-0 items-center gap-3 rounded transition-opacity hover:opacity-90"
						href={publicInvestigationMarketingHref}
						rel={marketingLinkRel}
						target="_blank"
					>
						<span className="shrink-0 font-medium text-muted-foreground text-sm">
							Investigated by
						</span>
						<Branding heightPx={28} priority variant="primary-logo" />
					</a>
				</div>
			</header>

			<main className="mx-auto w-full max-w-4xl flex-1 px-3 py-4 sm:p-6">
				{isLoading ? (
					<Card aria-label="Investigation">
						<div className="space-y-3 p-4 sm:p-5">
							<Skeleton className="h-5 w-2/3 rounded" />
							<Skeleton className="h-4 w-full rounded" />
							<Skeleton className="h-4 w-4/5 rounded" />
						</div>
					</Card>
				) : null}

				{!isLoading && data ? (
					<Card aria-label="Investigation">
						<header className="space-y-2 border-b px-4 py-4 sm:px-5">
							<div className="flex items-center justify-end">
								<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
									<StatusDot
										color={
											data.insight.status === "resolved" ? "success" : "warning"
										}
									/>
									{data.insight.status === "resolved" ? "Resolved" : "Open"}
								</span>
							</div>
							<h2 className="text-pretty font-semibold text-base text-foreground leading-snug sm:text-lg">
								{latest?.entity.label ?? data.insight.title}
							</h2>
						</header>
						<CaseState items={data.timeline} latest={latest} />
						<ol className="divide-y">
							{visibleItems.map((item) => (
								<li className="px-4 py-4 sm:px-5" key={item.id}>
									<InvestigationActivity
										collapseEvidence={false}
										insightId={null}
										item={item}
										websiteId={null}
									/>
								</li>
							))}
						</ol>
						{earlierCount > 0 ? (
							<div className="border-t px-4 py-2 sm:px-5">
								<Button
									onClick={() => setHistoryExpanded((expanded) => !expanded)}
									size="sm"
									type="button"
									variant="ghost"
								>
									{historyExpanded
										? "Hide earlier updates"
										: `Show ${earlierCount} earlier update${earlierCount === 1 ? "" : "s"}`}
									<CaretDownIcon
										className={historyExpanded ? "rotate-180" : undefined}
									/>
								</Button>
							</div>
						) : null}
					</Card>
				) : null}

				{isLoading || data ? null : (
					<EmptyState
						className="min-h-[50dvh]"
						description="This link was turned off, or it never existed."
						icon={<LightbulbIcon />}
						title="Investigation not available"
						variant="minimal"
					/>
				)}
			</main>

			<footer className="shrink-0 border-t bg-sidebar">
				<div className="mx-auto flex max-w-4xl justify-center px-4 py-3 sm:px-6">
					<a
						className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
						href={publicInvestigationMarketingHref}
						rel={marketingLinkRel}
						target="_blank"
					>
						Find out why your metrics moved with Databuddy &rarr;
					</a>
				</div>
			</footer>
		</div>
	);
}

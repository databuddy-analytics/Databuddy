"use client";

import { PlanetIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { AnalyticsToolbar } from "@/app/(main)/websites/[id]/_components/analytics-toolbar";
import { publicDashboardMarketingHref } from "@/app/public/public-dashboard-constants";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Branding } from "@/components/logo/branding";
import { Skeleton } from "@/components/ds/skeleton";
import { WebsiteErrorState } from "@/components/website-error-state";
import {
	batchDynamicQueryKeys,
	dynamicQueryKeys,
} from "@/hooks/use-dynamic-query";
import { useWebsite } from "@/hooks/use-websites";
import {
	currentFilterWebsiteIdAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";

const poweredByLabelClass =
	"shrink-0 text-balance font-medium text-muted-foreground text-sm";

/** Header Powered by row: wraps cleanly on narrow viewports. */
const brandAttributionLinkClass =
	"flex min-w-0 flex-wrap items-center gap-3 rounded transition-opacity hover:opacity-90";

const marketingLinkRel = "noopener noreferrer dofollow" as const;

export default function PublicWebsiteLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { id } = useParams();
	const websiteId = id as string;
	const queryClient = useQueryClient();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const setCurrentFilterWebsiteId = useSetAtom(currentFilterWebsiteIdAtom);

	useEffect(() => {
		setCurrentFilterWebsiteId(websiteId);
	}, [websiteId, setCurrentFilterWebsiteId]);

	const {
		data: websiteData,
		isLoading: isWebsiteLoading,
		isError: isWebsiteError,
		error: websiteError,
	} = useWebsite(websiteId);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["websites", websiteId] }),
				queryClient.invalidateQueries({
					queryKey: dynamicQueryKeys.byWebsite(websiteId),
				}),
				queryClient.invalidateQueries({
					queryKey: batchDynamicQueryKeys.byWebsite(websiteId),
				}),
			]);
		} catch {
			toast.error("Failed to refresh data");
		}
		setIsRefreshing(false);
	}, [websiteId, queryClient, setIsRefreshing]);

	if (!id) {
		return (
			<WebsiteErrorState error={{ data: { code: "NOT_FOUND" } }} isDemoRoute />
		);
	}

	if (!isWebsiteLoading && isWebsiteError) {
		return (
			<WebsiteErrorState
				error={websiteError}
				isDemoRoute
				websiteId={websiteId}
			/>
		);
	}

	const displayName = websiteData?.name || websiteData?.domain;

	return (
		<div className="flex h-full flex-col">
			<header className="shrink-0 border-b bg-sidebar">
				<div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
					<div className="flex min-w-0 items-center gap-3">
						<div className="shrink-0 rounded-lg bg-sidebar-accent p-1.5 ring-1 ring-sidebar-border/50">
							<FaviconImage
								altText={`${displayName || "Website"} favicon`}
								className="size-5"
								domain={websiteData?.domain || ""}
								fallbackIcon={
									<PlanetIcon
										className="text-sidebar-ring"
										size={20}
										weight="duotone"
									/>
								}
								size={20}
							/>
						</div>
						<div className="min-w-0">
							{displayName ? (
								<h1 className="truncate font-semibold text-sm">
									{displayName}
								</h1>
							) : (
								<Skeleton className="h-4 w-32" />
							)}
							{websiteData?.domain ? (
								<p className="truncate text-muted-foreground text-xs">
									{websiteData.domain}
								</p>
							) : (
								<Skeleton className="mt-1 h-3 w-24" />
							)}
						</div>
					</div>

					<a
						aria-label="Databuddy — open marketing site"
						className={brandAttributionLinkClass}
						href={publicDashboardMarketingHref}
						rel={marketingLinkRel}
						target="_blank"
					>
						<span className={poweredByLabelClass}>Powered by</span>
						<Branding heightPx={32} priority variant="primary-logo" />
					</a>
				</div>
			</header>

			<div className="shrink-0 bg-background">
				<div className="mx-auto max-w-screen-2xl">
					<AnalyticsToolbar
						isDisabled={isWebsiteLoading}
						isLoading={isWebsiteLoading}
						isRefreshing={isRefreshing}
						onRefreshAction={handleRefresh}
						websiteId={websiteId}
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				<div className="mx-auto max-w-screen-2xl">{children}</div>
			</div>

			<footer className="shrink-0 border-t bg-sidebar">
				<div className="mx-auto flex max-w-screen-2xl justify-center px-4 py-3 sm:px-6">
					<a
						aria-label="Get your own analytics dashboard on Databuddy"
						className="font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
						href={publicDashboardMarketingHref}
						rel={marketingLinkRel}
						target="_blank"
					>
						Get your own dashboard &rarr;
					</a>
				</div>
			</footer>
		</div>
	);
}

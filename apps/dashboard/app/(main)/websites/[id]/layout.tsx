"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { NoticeBanner } from "@/app/(main)/websites/_components/notice-banner";
import { LiveUserIndicator } from "@/components/analytics";
import { TopBar } from "@/components/layout/top-bar";
import { WebsiteErrorState } from "@/components/website-error-state";
import {
	batchDynamicQueryKeys,
	dynamicQueryKeys,
} from "@/hooks/use-dynamic-query";
import { updateWebsiteCache, useWebsite } from "@/hooks/use-websites";
import {
	DASHBOARD_FILTERS_QUERY_PARAM,
	parseDashboardFiltersParam,
	serializeDashboardFilters,
} from "@/lib/dashboard-navigation-actions";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	addDynamicFilterAtom,
	currentFilterWebsiteIdAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import { AnalyticsDateControls } from "./_components/analytics-date-controls";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { AddFilterForm } from "./_components/filters/add-filters";
import { FiltersSection } from "./_components/filters/filters-section";
import { SavedFiltersToolbar } from "./_components/filters/saved-filters-toolbar";
import { WebsiteTrackingSetupTab } from "./_components/tabs/tracking-setup-tab";
import { useTrackingSetup } from "./hooks/use-tracking-setup";
import { Button, usePersistentState } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	WarningCircleIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";

const ROUTES_WITHOUT_ANALYTICS_TOOLBAR = new Set([
	"agent",
	"flags",
	"map",
	"pulse",
	"realtime",
	"settings",
	"users",
]);
const TRACKING_ISSUE_DISMISS_MS = 24 * 60 * 60 * 1000;
const TRACKING_ISSUE_ACTION_CLASS =
	"h-7 rounded border border-border/70 bg-background px-2.5 font-medium text-foreground shadow-xs hover:bg-accent hover:text-foreground";
const TRACKING_ISSUE_ICON_ACTION_CLASS =
	"size-7 rounded text-muted-foreground hover:bg-accent hover:text-foreground";

function readStringSettingList(
	settings: unknown,
	key: "allowedOrigins" | "ignoredTrackingOrigins"
): string[] {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return [];
	}
	const value = (settings as Record<string, unknown>)[key];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function appendUniqueString(values: string[], value: string): string[] {
	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return values;
	}
	return values.some((item) => item.trim().toLowerCase() === normalized)
		? values
		: [...values, normalized];
}

function shouldHideAnalyticsToolbar(
	pathname: string,
	isEmbed: boolean
): boolean {
	if (isEmbed) {
		return true;
	}

	const [, routeGroup, , section] = pathname.split("/");
	if (routeGroup !== "websites" && routeGroup !== "demo") {
		return false;
	}

	return section != null && ROUTES_WITHOUT_ANALYTICS_TOOLBAR.has(section);
}

interface WebsiteLayoutProps {
	children: React.ReactNode;
}

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const websiteId = id as string;
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const setCurrentFilterWebsiteId = useSetAtom(currentFilterWebsiteIdAtom);
	const [dynamicFilters, setDynamicFilters] = useAtom(dynamicQueryFiltersAtom);
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));
	const [filtersParam, setFiltersParam] = useQueryState(
		DASHBOARD_FILTERS_QUERY_PARAM,
		parseAsString
	);
	const [, addFilter] = useAtom(addDynamicFilterAtom);
	const skipNextFilterUrlSync = useRef(false);
	const serializedDynamicFilters =
		dynamicFilters.length > 0
			? serializeDashboardFilters(dynamicFilters)
			: null;

	useEffect(() => {
		setCurrentFilterWebsiteId(websiteId);
	}, [websiteId, setCurrentFilterWebsiteId]);

	useEffect(() => {
		const parsedFilters = parseDashboardFiltersParam(filtersParam);
		if (parsedFilters === null) {
			if (filtersParam === null) {
				skipNextFilterUrlSync.current = true;
				setDynamicFilters([]);
			}
			return;
		}

		skipNextFilterUrlSync.current = true;
		setDynamicFilters(parsedFilters);
	}, [filtersParam, setDynamicFilters]);

	useEffect(() => {
		if (skipNextFilterUrlSync.current) {
			skipNextFilterUrlSync.current = false;
			return;
		}

		if (serializedDynamicFilters === filtersParam) {
			return;
		}
		setFiltersParam(serializedDynamicFilters);
	}, [filtersParam, serializedDynamicFilters, setFiltersParam]);

	const isDemoRoute = pathname?.startsWith("/demo/");
	const hideToolbar = shouldHideAnalyticsToolbar(pathname, isEmbed);

	const {
		data: websiteData,
		isLoading: isWebsiteLoading,
		isError: isWebsiteError,
		error: websiteError,
	} = useWebsite(websiteId);

	const { isTrackingSetup, isTrackingSetupLoading, trackingIssue } =
		useTrackingSetup(websiteId);
	const [dismissedTrackingIssueKeys, setDismissedTrackingIssueKeys] =
		usePersistentState<Record<string, number>>(
			`tracking-issue-banner-dismissed-${websiteId}`,
			{}
		);
	const trackingIssueDismissalKey = trackingIssue
		? [
				websiteId,
				trackingIssue.type,
				trackingIssue.originHost ?? trackingIssue.origin ?? "missing-origin",
			].join(":")
		: null;
	const trackingIssueDismissedAt = trackingIssueDismissalKey
		? (dismissedTrackingIssueKeys[trackingIssueDismissalKey] ?? 0)
		: 0;
	const isTrackingIssueDismissed =
		Date.now() - trackingIssueDismissedAt < TRACKING_ISSUE_DISMISS_MS;

	const updateSettingsMutation = useMutation({
		...orpc.websites.updateSettings.mutationOptions(),
		onSuccess: (updatedWebsite) => {
			updateWebsiteCache(queryClient, updatedWebsite);
			queryClient.invalidateQueries({
				queryKey: ["websites", "isTrackingSetup", websiteId],
			});
		},
	});

	const isToolbarLoading =
		isWebsiteLoading ||
		(!isDemoRoute && (isTrackingSetupLoading || isTrackingSetup === null));

	const isToolbarDisabled =
		!isDemoRoute && (!isTrackingSetup || isToolbarLoading);

	const showTrackingSetup =
		!(isDemoRoute || isTrackingSetupLoading) &&
		websiteData &&
		isTrackingSetup === false;
	const showTrackingIssue =
		!(isDemoRoute || isTrackingSetupLoading) &&
		trackingIssue &&
		!isTrackingIssueDismissed;

	const handleDismissTrackingIssue = useCallback(() => {
		if (!trackingIssueDismissalKey) {
			return;
		}
		setDismissedTrackingIssueKeys((prev) => ({
			...prev,
			[trackingIssueDismissalKey]: Date.now(),
		}));
	}, [setDismissedTrackingIssueKeys, trackingIssueDismissalKey]);

	const handleAllowTrackingOrigin = useCallback(() => {
		if (!(trackingIssue?.originHost && websiteData)) {
			return;
		}
		const allowedOrigins = appendUniqueString(
			readStringSettingList(websiteData.settings, "allowedOrigins"),
			trackingIssue.originHost
		);

		toast.promise(
			updateSettingsMutation.mutateAsync({
				id: websiteId,
				settings: { allowedOrigins },
			}),
			{
				loading: "Allowing tracking origin...",
				success: `${trackingIssue.originHost} can now send analytics`,
				error: "Failed to allow tracking origin",
			}
		);
	}, [
		trackingIssue?.originHost,
		websiteData,
		websiteId,
		updateSettingsMutation,
	]);

	const handleIgnoreTrackingOrigin = useCallback(() => {
		if (!(trackingIssue?.originHost && websiteData)) {
			return;
		}
		const ignoredTrackingOrigins = appendUniqueString(
			readStringSettingList(websiteData.settings, "ignoredTrackingOrigins"),
			trackingIssue.originHost
		);

		toast.promise(
			updateSettingsMutation.mutateAsync({
				id: websiteId,
				settings: { ignoredTrackingOrigins },
			}),
			{
				loading: "Ignoring tracking origin...",
				success: `${trackingIssue.originHost} warning hidden`,
				error: "Failed to ignore tracking origin",
			}
		);
	}, [
		trackingIssue?.originHost,
		websiteData,
		websiteId,
		updateSettingsMutation,
	]);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["websites", id] }),
				queryClient.invalidateQueries({
					queryKey: ["websites", "isTrackingSetup", id],
				}),
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
	};

	if (!id) {
		return <WebsiteErrorState error={{ data: { code: "NOT_FOUND" } }} />;
	}

	if (!isWebsiteLoading && isWebsiteError) {
		return (
			<WebsiteErrorState
				error={websiteError}
				isDemoRoute={isDemoRoute}
				websiteId={websiteId}
			/>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{!hideToolbar && (
				<>
					<TopBar.Title>
						<AnalyticsDateControls
							isDisabled={isToolbarDisabled}
							variant="topbar"
						/>
					</TopBar.Title>

					<TopBar.Actions>
						<AddFilterForm
							addFilter={addFilter}
							buttonText="Filter"
							disabled={isToolbarDisabled}
						/>
						<SavedFiltersToolbar />
						<LiveUserIndicator websiteId={websiteId} />
						<Button
							aria-label="Refresh data"
							disabled={isRefreshing || isToolbarDisabled}
							onClick={handleRefresh}
							size="sm"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn(
									"size-4 shrink-0",
									isRefreshing || isToolbarLoading ? "animate-spin" : ""
								)}
							/>
						</Button>
					</TopBar.Actions>

					<AnalyticsToolbar
						className="md:hidden"
						isDisabled={isToolbarDisabled}
					/>

					{!isToolbarDisabled && <FiltersSection />}
				</>
			)}

			{hideToolbar ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					{children}
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					{showTrackingIssue && trackingIssue ? (
						<div className="p-4 pb-0">
							<NoticeBanner
								description={trackingIssue.message}
								icon={<WarningCircleIcon />}
								title="Tracking requests are being blocked"
								tone="warning"
							>
								<div className="flex flex-wrap items-center gap-2">
									{trackingIssue.type === "origin_not_authorized" &&
									trackingIssue.originHost ? (
										<Button
											className={TRACKING_ISSUE_ACTION_CLASS}
											disabled={updateSettingsMutation.isPending}
											onClick={handleAllowTrackingOrigin}
											size="sm"
											variant="ghost"
										>
											Allow origin
										</Button>
									) : null}
									{trackingIssue.originHost ? (
										<Button
											className={TRACKING_ISSUE_ACTION_CLASS}
											disabled={updateSettingsMutation.isPending}
											onClick={handleIgnoreTrackingOrigin}
											size="sm"
											variant="ghost"
										>
											Ignore origin
										</Button>
									) : null}
									{trackingIssue.type === "origin_not_authorized" &&
									!trackingIssue.originHost ? (
										<Button
											asChild
											className={TRACKING_ISSUE_ACTION_CLASS}
											size="sm"
											variant="ghost"
										>
											<Link href={`/websites/${websiteId}/settings/general`}>
												Update domain
											</Link>
										</Button>
									) : null}
									<Button
										asChild
										className={TRACKING_ISSUE_ACTION_CLASS}
										size="sm"
										variant="ghost"
									>
										<Link href={`/websites/${websiteId}/settings/security`}>
											Security settings
										</Link>
									</Button>
									<Button
										aria-label="Dismiss tracking warning"
										className={TRACKING_ISSUE_ICON_ACTION_CLASS}
										onClick={handleDismissTrackingIssue}
										size="sm"
										variant="ghost"
									>
										<XMarkIcon aria-hidden className="size-4" />
									</Button>
								</div>
							</NoticeBanner>
						</div>
					) : null}
					{showTrackingSetup ? (
						<div className="p-4">
							<WebsiteTrackingSetupTab websiteId={websiteId} />
						</div>
					) : (
						children
					)}
				</div>
			)}
		</div>
	);
}

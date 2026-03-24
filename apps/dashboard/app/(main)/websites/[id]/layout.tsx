"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useEffect } from "react";
import { toast } from "sonner";
import { WebsiteErrorState } from "@/components/website-error-state";
import { useWebsite } from "@/hooks/use-websites";
import {
	currentFilterWebsiteIdAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { WebsiteTrackingSetupTab } from "./_components/tabs/tracking-setup-tab";
import { useTrackingSetup } from "./hooks/use-tracking-setup";

const NO_TOOLBAR_ROUTES = [
	"/assistant",
	"/map",
	"/flags",
	"/databunny",
	"/settings",
	"/users",
	"/agent",
	"/pulse",
];

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
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));

	useEffect(() => {
		setCurrentFilterWebsiteId(websiteId);
	}, [websiteId, setCurrentFilterWebsiteId]);

	const isDemoRoute = pathname?.startsWith("/demo/");
	const hideToolbar =
		isEmbed || NO_TOOLBAR_ROUTES.some((route) => pathname.includes(route));

	const {
		data: websiteData,
		isLoading: isWebsiteLoading,
		isError: isWebsiteError,
		error: websiteError,
	} = useWebsite(websiteId);

	const { isTrackingSetup, isTrackingSetupLoading } =
		useTrackingSetup(websiteId);

	if (!id) {
		return <WebsiteErrorState error={{ data: { code: "NOT_FOUND" } }} />;
	}

	if (!isWebsiteLoading && isWebsiteError) {
		return <WebsiteErrorState error={websiteError} websiteId={websiteId} />;
	}

	const isToolbarLoading =
		isWebsiteLoading ||
		(!isDemoRoute && (isTrackingSetupLoading || isTrackingSetup === null));

	const isToolbarDisabled =
		!isDemoRoute && (!isTrackingSetup || isToolbarLoading);

	const showTrackingSetup =
		!(isDemoRoute || isTrackingSetupLoading) &&
		websiteData &&
		isTrackingSetup === false;

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["websites", id] }),
				queryClient.invalidateQueries({
					queryKey: ["websites", "isTrackingSetup", id],
				}),
				queryClient.invalidateQueries({ queryKey: ["dynamic-query", id] }),
				queryClient.invalidateQueries({
					queryKey: ["batch-dynamic-query", id],
				}),
			]);
		} catch {
			toast.error("Failed to refresh data");
		}
		setIsRefreshing(false);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{!hideToolbar && (
				<div className="shrink-0 bg-background">
					<AnalyticsToolbar
						isDisabled={isToolbarDisabled}
						isLoading={isToolbarLoading}
						isRefreshing={isRefreshing}
						onRefreshAction={handleRefresh}
						websiteId={websiteId}
					/>
				</div>
			)}

			{hideToolbar ? (
				<div className="min-h-0 flex-1 overflow-hidden">
					{children}
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
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

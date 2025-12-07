"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { WebsiteErrorState } from "@/components/website-error-state";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { useWebsite } from "@/hooks/use-websites";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { WebsiteTrackingSetupTab } from "./_components/tabs/tracking-setup-tab";

type WebsiteLayoutProps = {
	children: React.ReactNode;
};

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const isDemoRoute = pathname?.startsWith("/demo/");
	const {
		isLoading: isWebsiteLoading,
		isError: isWebsiteError,
		error: websiteError,
		data: websiteData,
	} = useWebsite(id as string);
	const { isTrackingSetup, isTrackingSetupLoading } = useTrackingSetup(
		websiteData?.id ?? ""
	);
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const noToolbarPages = [
		"/assistant",
		"/map",
		"/flags",
		"/databunny",
		"/settings",
		"/users",
		"/agent",
	];

	const isAssistantPage = noToolbarPages.some((page) =>
		pathname.includes(page)
	);

	if (!id) {
		return <WebsiteErrorState error={{ data: { code: "NOT_FOUND" } }} />;
	}

	if (!isWebsiteLoading && isWebsiteError) {
		return <WebsiteErrorState error={websiteError} websiteId={id as string} />;
	}

	const websiteId = id as string;
	const isToolbarLoading =
		isWebsiteLoading ||
		(!isDemoRoute && (isTrackingSetupLoading || isTrackingSetup === null));
	const isToolbarDisabled =
		!isDemoRoute && (!isTrackingSetup || isToolbarLoading);

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
			toast.success("Data refreshed");
		} catch {
			toast.error("Failed to refresh data");
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{!isAssistantPage && (
				<div
					className="sticky top-0 right-0 left-0 z-50 shrink-0 space-y-0 bg-background md:top-0 md:left-84"
					ref={toolbarRef}
				>
					<AnalyticsToolbar
						isDisabled={isToolbarDisabled}
						isLoading={isToolbarLoading}
						isRefreshing={isRefreshing}
						onRefreshAction={handleRefresh}
						websiteId={websiteId}
					/>
				</div>
			)}

			<div
				className={`${isAssistantPage ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}`}
			>
				{isAssistantPage ? (
					children
				) : !isDemoRoute &&
					websiteData &&
					!isTrackingSetupLoading &&
					isTrackingSetup !== null &&
					isTrackingSetup === false ? (
					<div className="p-4">
						<WebsiteTrackingSetupTab websiteId={websiteId} />
					</div>
				) : (
					children
				)}
			</div>
		</div>
	);
}

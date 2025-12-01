"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import NotFound from "@/app/not-found";
import { Skeleton } from "@/components/ui/skeleton";
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
	const { isTrackingSetup, isTrackingSetupLoading } = useTrackingSetup(
		id as string
	);	
	const { isLoading: isWebsiteLoading } = useWebsite(id as string);
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const noToolbarPages = [
		"/assistant",
		"/map",
		"/flags",
		"/databunny",
		"/settings",
		"/users",
	];

	const isAssistantPage = noToolbarPages.some((page) =>
		pathname.includes(page)
	);

	if (!id) {
		return <NotFound />;
	}

	const websiteId = id as string;
	const isToolbarLoading =
		isWebsiteLoading || isTrackingSetupLoading || isTrackingSetup === null;
	const isToolbarDisabled = !isTrackingSetup || isToolbarLoading;

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
						onRefresh={handleRefresh}
						websiteId={websiteId}
					/>
				</div>
			)}

			<div
				className={`${isAssistantPage ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}`}
			>
			{!isAssistantPage && isTrackingSetupLoading ? (
				<div className="space-y-4 p-4">
					{/* Two DataTables side by side */}
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						{[1, 2].map((num) => (
							<div
								className="overflow-hidden rounded border bg-sidebar"
								key={`skeleton-table-${num}`}
							>
								<div className="p-3">
									<Skeleton className="h-5 w-32" />
									<Skeleton className="mt-1 h-3 w-48" />
								</div>
								<div className="space-y-2 px-3 pb-3">
									{Array.from({ length: 5 }).map((_, idx) => (
										<div
											className="flex items-center gap-3 rounded bg-muted/20 p-3"
											key={`row-${num}-${idx}`}
										>
											<Skeleton className="size-6 shrink-0 rounded-full" />
											<div className="flex-1 space-y-1.5">
												<Skeleton className="h-4 w-3/4" />
												<Skeleton className="h-3 w-1/2" />
											</div>
											<Skeleton className="h-4 w-12" />
										</div>
									))}
								</div>
							</div>
						))}
					</div>
					{/* Full width DataTable */}
					<div className="overflow-hidden rounded border bg-sidebar">
						<div className="p-3">
							<Skeleton className="h-5 w-40" />
							<Skeleton className="mt-1 h-3 w-64" />
							<div className="mt-3 flex gap-2">
								{[1, 2, 3, 4].map((tab) => (
									<Skeleton className="h-8 w-20" key={`tab-${tab}`} />
								))}
							</div>
						</div>
						<div className="space-y-2 px-3 pb-3">
							{Array.from({ length: 6 }).map((_, idx) => (
								<div
									className="flex items-center gap-3 rounded bg-muted/20 p-3"
									key={`geo-row-${idx}`}
								>
									<Skeleton className="size-6 shrink-0 rounded" />
									<div className="flex-1 space-y-1.5">
										<Skeleton className="h-4 w-2/3" />
										<Skeleton className="h-3 w-1/3" />
									</div>
									<Skeleton className="h-4 w-16" />
								</div>
							))}
						</div>
					</div>
				</div>
			) : !isAssistantPage && isTrackingSetup === false ? (
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

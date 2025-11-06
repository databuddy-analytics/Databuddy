"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import NotFound from "@/app/not-found";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { FiltersSection } from "./_components/filters-section";

type WebsiteLayoutProps = {
	children: React.ReactNode;
};

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const { isTrackingSetup } = useTrackingSetup(id as string);
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [toolbarHeight, setToolbarHeight] = useState(88);

	const isAssistantPage =
		pathname.includes("/assistant") ||
		pathname.includes("/map") ||
		pathname.includes("/flags") ||
		pathname.includes("/databunny") ||
		pathname.includes("/settings") ||
		pathname.includes("/users");

	useLayoutEffect(() => {
		const element = toolbarRef.current;
		if (!element || isAssistantPage || !isTrackingSetup) {
			setToolbarHeight(0);
			return;
		}

		const updateHeight = () => {
			const height = element.getBoundingClientRect().height;
			setToolbarHeight(height);
		};

		updateHeight();

		const resizeObserver = new ResizeObserver(updateHeight);
		resizeObserver.observe(element);

		return () => {
			resizeObserver.disconnect();
		};
	}, [isTrackingSetup, isAssistantPage]);

	if (!id) {
		return <NotFound />;
	}

	const websiteId = id as string;

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
			{isTrackingSetup && !isAssistantPage && (
				<div
					className="fixed top-12 right-0 left-0 z-50 shrink-0 space-y-0 bg-background md:top-0 md:left-84"
					ref={toolbarRef}
				>
					<AnalyticsToolbar
						isRefreshing={isRefreshing}
						onRefresh={handleRefresh}
						websiteId={websiteId}
					/>
					<FiltersSection />
				</div>
			)}

			<div
				className={`${isAssistantPage ? "min-h-0 flex-1" : isTrackingSetup && !isAssistantPage ? "min-h-0 flex-1 overflow-y-auto" : "min-h-0 flex-1 overflow-y-auto"}`}
				style={
					isTrackingSetup && !isAssistantPage
						? { paddingTop: `${toolbarHeight}px` }
						: undefined
				}
			>
				{children}
			</div>
		</div>
	);
}

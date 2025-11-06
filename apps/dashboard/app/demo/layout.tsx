"use client";

import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AnalyticsToolbar } from "@/app/(main)/websites/[id]/_components/analytics-toolbar";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";

interface MainLayoutProps {
	children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const { id } = useParams();

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			// Simulate refresh for demo
			await new Promise((resolve) => setTimeout(resolve, 1000));
			toast.success("Demo data refreshed");
		} catch {
			toast.error("Failed to refresh data");
		} finally {
			setIsRefreshing(false);
		}
	};

	return (
		<div className="h-screen overflow-hidden text-foreground">
			<Sidebar />
			<div className="relative h-screen pl-0 md:pl-84">
				<div className="h-screen overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
					<div
						className={cn(
							"mx-auto flex h-full max-w-[1600px] flex-col",
							"p-3 sm:p-4 lg:p-6"
						)}
					>
						<div className="flex-shrink-0 space-y-4">
							<AnalyticsToolbar
								isRefreshing={isRefreshing}
								onRefresh={handleRefresh}
								websiteId={id as string}
							/>
						</div>

						<div className="min-h-0 flex-1">{children}</div>
					</div>
				</div>
			</div>
		</div>
	);
}

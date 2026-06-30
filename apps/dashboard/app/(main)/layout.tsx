import { publicConfig } from "@databuddy/env/public";
import { FeedbackPrompt } from "@/components/feedback-prompt";
import { isDashboardE2E } from "@/lib/e2e-mode";
import { Sidebar } from "@/components/layout/sidebar";
import {
	SidebarInset,
	SidebarLayout,
} from "@/components/layout/sidebar-layout";
import { SidebarNavigationProvider } from "@/components/layout/sidebar-navigation-provider";
import { TopBar, TopBarProvider } from "@/components/layout/top-bar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { SessionGuard } from "@/components/providers/session-guard";
import { CommandSearchProvider } from "@/components/ui/command-search";
import { Skeleton } from "@databuddy/ui";
import { AutumnProvider } from "autumn-js/react";
import { Suspense } from "react";

function SidebarFallback() {
	return (
		<nav className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-sidebar-border/50 border-r bg-sidebar md:flex">
			<div className="flex h-12 items-center gap-2.5 border-sidebar-border/30 border-b px-3">
				<Skeleton className="size-6 rounded" />
				<Skeleton className="h-4 w-24 rounded" />
			</div>
			<div className="flex flex-1 flex-col gap-1 px-2 pt-3">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton
						className="h-8 rounded"
						key={i}
						style={{ width: `${70 - i * 5}%` }}
					/>
				))}
			</div>
		</nav>
	);
}

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const content = (
		<BillingProvider>
			<CommandSearchProvider>
				<SidebarNavigationProvider>
					<SessionGuard>
						<SidebarLayout>
							<TopBarProvider>
								<div className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
									<Suspense fallback={<SidebarFallback />}>
										<Sidebar />
									</Suspense>
									<SidebarInset>
										<TopBar />
										<div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden overscroll-y-none pt-12 md:pt-0">
											{children}
										</div>
									</SidebarInset>
									<FeedbackPrompt />
								</div>
							</TopBarProvider>
						</SidebarLayout>
					</SessionGuard>
				</SidebarNavigationProvider>
			</CommandSearchProvider>
		</BillingProvider>
	);

	if (isDashboardE2E) {
		return content;
	}

	return (
		<AutumnProvider backendUrl={publicConfig.urls.api} includeCredentials>
			{content}
		</AutumnProvider>
	);
}

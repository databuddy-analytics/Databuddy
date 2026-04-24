import { FeedbackPrompt } from "@/components/feedback-prompt";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarNavigationProvider } from "@/components/layout/sidebar-navigation-provider";
import { BillingProvider } from "@/components/providers/billing-provider";
import { SessionGuard } from "@/components/providers/session-guard";
import { CommandSearchProvider } from "@/components/ui/command-search";
import { AutumnProvider } from "autumn-js/react";
import { Suspense } from "react";

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
			includeCredentials
		>
			<BillingProvider>
				<CommandSearchProvider>
					<SidebarNavigationProvider>
						<SessionGuard>
							<div className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
								<Suspense fallback={null}>
									<Sidebar />
								</Suspense>
								<div className="relative flex min-h-0 flex-1 flex-col pl-0 md:pl-76 lg:pl-84">
									<div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden overscroll-y-none pt-12 md:pt-0">
										{children}
									</div>
								</div>
								<FeedbackPrompt />
							</div>
						</SessionGuard>
					</SidebarNavigationProvider>
				</CommandSearchProvider>
			</BillingProvider>
		</AutumnProvider>
	);
}

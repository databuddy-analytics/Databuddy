import { AutumnProvider } from "autumn-js/react";
import { DevToolsDrawer } from "@/components/dev-tools/dev-tools-drawer";
import { Sidebar } from "@/components/layout/sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { CommandSearch } from "@/components/ui/command-search";

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<div className="h-screen overflow-hidden text-foreground">
					<Sidebar />
					<CommandSearch />
					<DevToolsDrawer />
					<div className="relative h-screen pl-0 md:pl-76 lg:pl-84">
						<div className="h-screen overflow-y-auto overflow-x-hidden pt-12 md:pt-0">
							{children}
						</div>
					</div>
				</div>
			</BillingProvider>
		</AutumnProvider>
	);
}

import { auth } from "@databuddy/auth";
import { AutumnProvider } from "autumn-js/react";
import { headers } from "next/headers";
import { DevToolsDrawer } from "@/components/dev-tools/dev-tools-drawer";
import { Sidebar } from "@/components/layout/sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { CommandSearch } from "@/components/ui/command-search";

export default async function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const headersList = await headers();
	const session = await auth.api.getSession({
		headers: headersList,
	});

	const user = session?.user || {
		name: null,
		email: null,
		image: null,
	};

	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<div className="h-dvh overflow-hidden text-foreground">
					<Sidebar user={user} />
					<CommandSearch />
					<DevToolsDrawer />
					<div className="relative h-dvh pl-0 md:pl-76 lg:pl-84">
						<div className="h-dvh overflow-y-auto overflow-x-hidden pt-12 md:pt-0">
							{children}
						</div>
					</div>
				</div>
			</BillingProvider>
		</AutumnProvider>
	);
}

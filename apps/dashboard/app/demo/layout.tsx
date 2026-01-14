import { AutumnProvider } from "autumn-js/react";
import { Sidebar } from "@/components/layout/sidebar";
import { BillingProvider } from "@/components/providers/billing-provider";

export default async function DemoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
		>
			<BillingProvider>
				<div className="h-dvh overflow-hidden text-foreground">
					<Sidebar user={null} />
					<div className="relative h-dvh pl-0 md:pl-76 lg:pl-84">
						<div className="h-dvh overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
							{children}
						</div>
					</div>
				</div>
			</BillingProvider>
		</AutumnProvider>
	);
}

"use client";

import { publicConfig } from "@databuddy/env/public";

import { AutumnProvider } from "autumn-js/react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
	SidebarInset,
	SidebarLayout,
} from "@/components/layout/sidebar-layout";
import { SidebarNavigationProvider } from "@/components/layout/sidebar-navigation-provider";
import { TopBar, TopBarProvider } from "@/components/layout/top-bar";
import { BillingProvider } from "@/components/providers/billing-provider";
import { CommandSearchProvider } from "@/components/ui/command-search";

function DemoLayoutContent({ children }: { children: React.ReactNode }) {
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));

	if (isEmbed) {
		return (
			<SidebarLayout>
				<TopBarProvider>
					<div className="h-dvh overflow-hidden text-foreground">
						<div className="h-dvh overflow-y-auto overflow-x-hidden">
							{children}
						</div>
					</div>
				</TopBarProvider>
			</SidebarLayout>
		);
	}

	return (
		<CommandSearchProvider>
			<SidebarNavigationProvider>
				<SidebarLayout>
					<TopBarProvider>
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
							<Suspense fallback={null}>
								<Sidebar />
							</Suspense>
							<SidebarInset>
								<TopBar />
								<div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden overscroll-y-none pt-12 md:pt-0">
									{children}
								</div>
							</SidebarInset>
						</div>
					</TopBarProvider>
				</SidebarLayout>
			</SidebarNavigationProvider>
		</CommandSearchProvider>
	);
}

export default function DemoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider backendUrl={publicConfig.urls.api} includeCredentials>
			<BillingProvider public>
				<DemoLayoutContent>{children}</DemoLayoutContent>
			</BillingProvider>
		</AutumnProvider>
	);
}

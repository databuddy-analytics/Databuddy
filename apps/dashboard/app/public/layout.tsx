"use client";

import { publicConfig } from "@databuddy/env/public";

import { AutumnProvider } from "autumn-js/react";
import { BillingProvider } from "@/components/providers/billing-provider";

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider backendUrl={publicConfig.urls.api} includeCredentials>
			<BillingProvider public>
				<div className="h-dvh overflow-hidden text-foreground">{children}</div>
			</BillingProvider>
		</AutumnProvider>
	);
}

"use client";

import { AutumnProvider } from "autumn-js/react";
import { BillingProvider } from "@/components/providers/billing-provider";

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AutumnProvider
			backendUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
			includeCredentials
		>
			<BillingProvider public>
				<div className="h-dvh overflow-hidden text-foreground">{children}</div>
			</BillingProvider>
		</AutumnProvider>
	);
}

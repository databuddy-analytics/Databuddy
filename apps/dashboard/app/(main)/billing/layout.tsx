import { readBooleanEnv } from "@databuddy/env/boolean";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BillingHeader } from "./components/billing-header";

export default function BillingLayout({ children }: { children: ReactNode }) {
	if (readBooleanEnv("SELFHOST")) {
		redirect("/websites");
	}
	return (
		<div className="flex h-full flex-col">
			<BillingHeader />
			{children}
		</div>
	);
}

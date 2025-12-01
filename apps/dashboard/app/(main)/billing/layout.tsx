import type { ReactNode } from "react";
import { BillingHeader } from "./components/billing-header";

export default function BillingLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full flex-col">
			<BillingHeader />
			{children}
		</div>
	);
}

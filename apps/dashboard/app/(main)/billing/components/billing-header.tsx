"use client";

import { CreditCardIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
	"/billing": {
		title: "Usage & Metrics",
		description: "Monitor your usage and billing metrics",
	},
	"/billing/plans": {
		title: "Plans & Pricing",
		description: "Manage your subscription and billing plan",
	},
	"/billing/history": {
		title: "Payment History",
		description: "View your billing history and invoices",
	},
};

const DEFAULT_TITLE = {
	title: "Billing & Subscription",
	description: "Manage your subscription, usage, and billing preferences",
};

export function BillingHeader() {
	const pathname = usePathname();
	const { title, description } = PAGE_TITLES[pathname] ?? DEFAULT_TITLE;

	return (
		<div className="border-b bg-linear-to-r from-background via-background to-muted/20">
			<div className="flex h-24 items-center px-4 sm:px-6">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-4">
						<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
							<CreditCardIcon
								className="h-6 w-6 text-primary"
								size={24}
								weight="duotone"
							/>
						</div>
						<div>
							<h1 className="truncate font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
								{title}
							</h1>
							<p className="mt-1 text-muted-foreground text-sm sm:text-base">
								{description}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

"use client";

import { CreditCardIcon } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { PageHeader } from "../../websites/_components/page-header";

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
		<PageHeader
			description={description}
			icon={<CreditCardIcon weight="duotone" />}
			title={title}
		/>
	);
}

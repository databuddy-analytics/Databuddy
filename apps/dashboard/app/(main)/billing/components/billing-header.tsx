"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";

const PAGE_TITLES: Record<string, string> = {
	"/billing": "Billing overview",
	"/billing/plans": "Plans",
	"/billing/history": "Invoices",
};

export function BillingHeader() {
	const pathname = usePathname();
	const title = PAGE_TITLES[pathname] ?? "Billing";
	const items =
		pathname === "/billing"
			? [{ label: "Billing" }]
			: [{ label: "Billing", href: "/billing" }, { label: title }];

	return <TopBar.Breadcrumbs items={items} />;
}

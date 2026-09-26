"use client";

import { isSelfHosted } from "@databuddy/env/public";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
	useBillingContext,
	useInvestigationUsage,
} from "@/components/providers/billing-provider";
import { orpc } from "@/lib/orpc";
import { LockSimpleIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export function InvestigationsAccessNotice({
	organizationId,
}: {
	organizationId?: string;
}) {
	const { isLoading } = useBillingContext();
	const { hasAccess } = useInvestigationUsage();
	const configQuery = useQuery({
		...orpc.insightGeneration.getConfig.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId) && !isSelfHosted,
	});

	const hadInvestigationsEnabled = Boolean(configQuery.data?.enabled);
	const canInvestigate = isLoading || hasAccess;

	if (isSelfHosted || canInvestigate || !hadInvestigationsEnabled) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-4 py-2.5">
			<LockSimpleIcon className="size-4 shrink-0 text-muted-foreground" />
			<p className="min-w-0 flex-1 text-muted-foreground text-sm">
				Automatic investigations now run on the Business and Scale plans, so
				your scheduled runs are paused. Existing findings stay available and you
				can still ask Databunny for a manual check.
			</p>
			<Button asChild size="sm" variant="secondary">
				<Link href="/billing/plans?plan=intelligence">Upgrade to Business</Link>
			</Button>
		</div>
	);
}

"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { useQuery } from "@tanstack/react-query";
import { useBillingContext } from "@/components/providers/billing-provider";
import { orpc } from "@/lib/orpc";
import { LockSimpleIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

export function InvestigationsAccessNotice({
	organizationId,
}: {
	organizationId?: string;
}) {
	const { isFeatureEnabled, isLoading } = useBillingContext();
	const configQuery = useQuery({
		...orpc.insightGeneration.getConfig.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
	});

	const hadInvestigationsEnabled = Boolean(configQuery.data?.enabled);
	const hasAccess =
		isLoading || isFeatureEnabled(GATED_FEATURES.INVESTIGATIONS);

	if (hasAccess || !hadInvestigationsEnabled) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-4 py-2.5">
			<LockSimpleIcon
				className="size-4 shrink-0 text-muted-foreground"
				weight="duotone"
			/>
			<p className="min-w-0 flex-1 text-muted-foreground text-sm">
				Automatic investigations are now invite only, so your scheduled runs are
				paused. Existing findings stay available and Databunny chat still works
				with your credits.
			</p>
			<Button asChild size="sm" variant="secondary">
				<a
					href="https://www.databuddy.cc/contact?topic=intelligence-business"
					rel="noopener noreferrer"
					target="_blank"
				>
					Request access
				</a>
			</Button>
		</div>
	);
}

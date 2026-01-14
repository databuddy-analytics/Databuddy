"use client";

import {
	FEATURE_METADATA,
	type GatedFeatureId,
	getMinimumPlanForFeature,
	PLAN_IDS,
} from "@databuddy/shared/types/features";
import {
	ArrowRightIcon,
	CrownIcon,
	LockSimpleIcon,
	RocketLaunchIcon,
	SparkleIcon,
	StarIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useBillingContext } from "@/components/providers/billing-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PLAN_CONFIG: Record<
	string,
	{ name: string; icon: typeof StarIcon; color: string }
> = {
	[PLAN_IDS.FREE]: {
		name: "Free",
		icon: SparkleIcon,
		color: "text-muted-foreground",
	},
	[PLAN_IDS.HOBBY]: {
		name: "Hobby",
		icon: RocketLaunchIcon,
		color: "text-success",
	},
	[PLAN_IDS.PRO]: { name: "Pro", icon: StarIcon, color: "text-primary" },
	[PLAN_IDS.SCALE]: { name: "Scale", icon: CrownIcon, color: "text-amber-500" },
};

interface FeatureGateProps {
	feature: GatedFeatureId;
	children: ReactNode;
	title?: string;
	description?: string;
	blockWhileLoading?: boolean;
}

export function FeatureGate({
	feature,
	children,
	title,
	description,
	blockWhileLoading = false,
}: FeatureGateProps) {
	const { isFeatureEnabled, currentPlanId, isLoading, canUserUpgrade } =
		useBillingContext();

	if (isLoading && !blockWhileLoading) {
		return <>{children}</>;
	}

	if (isFeatureEnabled(feature)) {
		return <>{children}</>;
	}

	const metadata = FEATURE_METADATA[feature];
	const minPlanFromMatrix = getMinimumPlanForFeature(feature);
	const requiredPlan = minPlanFromMatrix ?? metadata?.minPlan ?? PLAN_IDS.PRO;
	const planConfig = PLAN_CONFIG[requiredPlan] ?? PLAN_CONFIG[PLAN_IDS.PRO];
	const currentConfig =
		PLAN_CONFIG[currentPlanId ?? PLAN_IDS.FREE] ?? PLAN_CONFIG[PLAN_IDS.FREE];
	const PlanIcon = planConfig.icon;
	const CurrentIcon = currentConfig.icon;

	return (
		<div className="flex h-full min-h-[400px] items-center justify-center p-4">
			<Card className="w-full max-w-md overflow-hidden pt-0">
				<CardHeader className="dotted-bg flex flex-col items-center gap-4 border-b bg-accent py-8">
					<div className="flex size-14 items-center justify-center rounded border bg-card">
						<LockSimpleIcon
							className="size-7 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="text-center">
						<h2 className="font-semibold text-lg">
							{title ?? `Unlock ${metadata?.name ?? "this feature"}`}
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{description ??
								metadata?.description ??
								"Upgrade to access this feature."}
						</p>
					</div>
				</CardHeader>

				<CardContent className="space-y-4 p-4">
					{/* Required plan */}
					<div className="flex items-center justify-between rounded border bg-accent/50 px-3 py-2.5">
						<span className="text-muted-foreground text-sm">Required plan</span>
						<div className="flex items-center gap-1.5">
							<PlanIcon
								className={cn("size-4", planConfig.color)}
								weight="duotone"
							/>
							<span className={cn("font-semibold text-sm", planConfig.color)}>
								{planConfig.name}
							</span>
						</div>
					</div>

					{/* Current plan */}
					<div className="flex items-center justify-between rounded border px-3 py-2.5">
						<span className="text-muted-foreground text-sm">Your plan</span>
						<div className="flex items-center gap-1.5">
							<CurrentIcon
								className={cn("size-4", currentConfig.color)}
								weight="duotone"
							/>
							<span className="font-medium text-foreground text-sm">
								{currentConfig.name}
							</span>
						</div>
					</div>

					{/* CTA */}
					{canUserUpgrade ? (
						<Button asChild className="group w-full gap-2" size="lg">
							<Link href="/billing/plans">
								<RocketLaunchIcon className="size-5" weight="duotone" />
								Upgrade to {planConfig.name}
								<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
							</Link>
						</Button>
					) : (
						<div className="rounded-md border bg-muted/50 px-4 py-3 text-center">
							<p className="font-medium text-muted-foreground text-sm">
								Contact your organization owner to upgrade
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export function useFeatureGate(feature: GatedFeatureId) {
	const {
		isFeatureEnabled,
		getGatedFeatureAccess,
		isLoading,
		canUserUpgrade,
		isOrganizationBilling,
	} = useBillingContext();

	const access = getGatedFeatureAccess(feature);
	const metadata = FEATURE_METADATA[feature];
	const minPlan =
		getMinimumPlanForFeature(feature) ?? metadata?.minPlan ?? null;
	const planConfig = minPlan ? PLAN_CONFIG[minPlan] : null;

	return {
		isEnabled: isFeatureEnabled(feature),
		isLoading,
		...access,
		planName: planConfig?.name ?? null,
		featureName: metadata?.name ?? feature,
		canUserUpgrade,
		isOrganizationBilling,
	};
}

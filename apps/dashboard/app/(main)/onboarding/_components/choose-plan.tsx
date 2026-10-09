"use client";

import { getPlanDisplayName } from "@databuddy/shared/types/features";
import { Button, Card, EmptyState, Skeleton } from "@databuddy/ui";
import { WarningIcon } from "@databuddy/ui/icons";
import { useListPlans } from "autumn-js/react";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import {
	allowanceText,
	DISPLAYED_PLAN_IDS,
	formatPriceAmount,
	PLAN_TAGLINES,
	PlanButton,
} from "@/components/autumn/pricing-table";
import { useBillingContext } from "@/components/providers/billing-provider";
import { getCustomerPlanName } from "@/lib/autumn/customer-plan-name";
import type { SetupChecklistProps } from "./setup-checklist";

type Plan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];

function usageLabel(items: Plan["items"]) {
	return [
		["events", "events"],
		[INVESTIGATION_USAGE.featureId, "investigations"],
	]
		.flatMap(([featureId, unit]) => {
			const item = items.find(
				(entry) =>
					entry.featureId === featureId && (entry.included || entry.unlimited)
			);
			return item ? [allowanceText(item, unit)] : [];
		})
		.join(" · ");
}

function priceLabel(price: Plan["price"]) {
	if (!price) {
		return "Free";
	}
	const amount = formatPriceAmount(price.amount);
	if (price.interval === "one_off") {
		return amount;
	}
	const count = price.intervalCount ?? 1;
	return `${amount} / ${count === 1 ? price.interval : `${count} ${price.interval}s`}`;
}

export function ChoosePlan({
	finish,
	onBack,
	successPath,
}: {
	finish: NonNullable<SetupChecklistProps["finish"]>;
	onBack: () => void;
	successPath: string;
}) {
	const billing = useBillingContext();
	const { data: plans, isLoading, error, refetch } = useListPlans();
	const rows = DISPLAYED_PLAN_IDS.flatMap(
		(id) => plans?.find((plan) => plan.id === id) ?? []
	).reverse();

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
				<div className="mb-4 flex items-center justify-between gap-3">
					<h1 className="font-semibold text-xl">Pick a plan</h1>
					<Button onClick={onBack} size="sm" variant="ghost">
						Back to setup
					</Button>
				</div>
				<Card className="gap-0 py-0">
					<Card.Header className="gap-1 border-border border-b bg-card px-5 py-4">
						<Card.Title>
							{billing.isLoading || billing.isError
								? "Your setup is saved"
								: `You are on ${getPlanDisplayName(billing.currentPlanId)}`}
						</Card.Title>
						<Card.Description>
							Upgrade now for more events and Databunny investigations, or keep
							going and change plans anytime from Billing.
						</Card.Description>
					</Card.Header>

					{isLoading ? (
						[1, 2, 3, 4].map((id) => (
							<div
								className="flex items-center gap-4 border-border border-b px-5 py-4"
								key={id}
							>
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-3 w-56" />
								</div>
								<Skeleton className="h-8 w-20" />
							</div>
						))
					) : error ? (
						<div className="border-border border-b p-5">
							<EmptyState
								action={{ label: "Try again", onClick: () => refetch() }}
								description="Try again in a moment."
								icon={<WarningIcon />}
								title="Failed to load plans"
								variant="error"
							/>
						</div>
					) : (
						rows.map((plan) => (
							<div
								className="flex items-center gap-4 border-border border-b px-5 py-4"
								key={plan.id}
							>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-sm">
										{getCustomerPlanName(plan.id, plan.name)}
									</p>
									<p className="mt-0.5 text-sm tabular-nums">
										{usageLabel(plan.items)}
									</p>
									<p className="mt-0.5 text-pretty text-muted-foreground text-xs">
										{PLAN_TAGLINES[plan.id] ?? plan.description}
									</p>
								</div>
								<span className="shrink-0 text-sm tabular-nums">
									{priceLabel(plan.price)}
								</span>
								<PlanButton
									className="w-28 shrink-0"
									onPlanUpdated={billing.refetch}
									plan={plan}
									size="sm"
									successPath={successPath}
								/>
							</div>
						))
					)}

					<Card.Footer className="flex-wrap justify-between gap-3 px-5 py-4">
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							{finish.note ? <p>{finish.note}</p> : null}
							{finish.onRetry ? (
								<Button onClick={finish.onRetry} size="sm" variant="secondary">
									Try again
								</Button>
							) : null}
						</div>
						<Button loading={finish.loading} onClick={finish.onClick}>
							{finish.label}
						</Button>
					</Card.Footer>
				</Card>
			</div>
		</div>
	);
}

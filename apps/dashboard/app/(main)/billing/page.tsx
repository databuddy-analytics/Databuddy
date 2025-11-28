"use client";

import {
	ArrowSquareOutIcon,
	CalendarIcon,
	CrownIcon,
} from "@phosphor-icons/react";
import type { Product } from "autumn-js";
import dayjs from "dayjs";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CancelSubscriptionDialog } from "./components/cancel-subscription-dialog";
import { CreditCardDisplay } from "./components/credit-card-display";
import { EmptyUsageState, ErrorState } from "./components/empty-states";
import { OverviewSkeleton } from "./components/overview-skeleton";
import { PlanStatusBadge } from "./components/plan-status-badge";
import { UsageRow } from "./components/usage-row";
import { useBilling, useBillingData } from "./hooks/use-billing";

export default function BillingPage() {
	const { products, usage, customer, isLoading, error, refetch } =
		useBillingData();
	const {
		onCancelClick,
		onCancelConfirm,
		onCancelDialogClose,
		onManageBilling,
		showCancelDialog,
		cancelTarget,
		getSubscriptionStatusDetails,
	} = useBilling(refetch);

	const { currentPlan, currentProduct, usageStats, statusDetails } =
		useMemo(() => {
			const activeCustomerProduct = customer?.products?.find((p) => {
				if (p.canceled_at && p.current_period_end) {
					return dayjs(p.current_period_end).isAfter(dayjs());
				}
				return !p.canceled_at || p.status === "scheduled";
			});

			const activePlan = activeCustomerProduct
				? products?.find((p: Product) => p.id === activeCustomerProduct.id)
				: products?.find(
						(p: Product) =>
							!p.scenario ||
							(p.scenario !== "upgrade" && p.scenario !== "downgrade")
					);

			const planStatusDetails = activeCustomerProduct
				? getSubscriptionStatusDetails(
						activeCustomerProduct as unknown as Parameters<
							typeof getSubscriptionStatusDetails
						>[0]
					)
				: "";

			return {
				currentPlan: activePlan,
				currentProduct: activeCustomerProduct,
				usageStats: usage?.features ?? [],
				statusDetails: planStatusDetails,
			};
		}, [
			products,
			usage?.features,
			customer?.products,
			getSubscriptionStatusDetails,
		]);

	if (isLoading) {
		return (
			<main className="min-h-0 flex-1 overflow-hidden">
				<OverviewSkeleton />
			</main>
		);
	}

	if (error) {
		return (
			<main className="min-h-0 flex-1 overflow-hidden">
				<ErrorState error={error} onRetry={refetch} />
			</main>
		);
	}

	const isFree = currentPlan?.id === "free" || currentPlan?.properties?.is_free;
	const isCanceled = currentPlan?.scenario === "cancel";

	return (
		<main className="min-h-0 flex-1 overflow-hidden">
			<div className="flex h-full flex-col overflow-y-auto lg:grid lg:h-full lg:grid-cols-[1fr_20rem] lg:overflow-hidden">
				<CancelSubscriptionDialog
					currentPeriodEnd={cancelTarget?.currentPeriodEnd}
					isLoading={isLoading}
					onCancel={onCancelConfirm}
					onOpenChange={(open) => {
						if (!open) {
							onCancelDialogClose();
						}
					}}
					open={showCancelDialog}
					planName={cancelTarget?.name ?? ""}
				/>

				{/* Main Content */}
				<div className="shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
					<div className="border-b px-5 py-4">
						<h2 className="font-semibold">Usage</h2>
						<p className="text-muted-foreground text-sm">
							Track your feature consumption
						</p>
					</div>

					{usageStats.length === 0 ? (
						<EmptyUsageState />
					) : (
						<div className="divide-y">
							{usageStats.map((feature) => (
								<UsageRow feature={feature} key={feature.id} />
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<div className="flex w-full shrink-0 flex-col border-t bg-muted/30 lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l">
					{/* Plan */}
					<div className="border-b p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="font-semibold">Current Plan</h3>
							<PlanStatusBadge
								isCanceled={!!currentProduct?.canceled_at}
								isScheduled={currentProduct?.status === "scheduled"}
							/>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border bg-background">
								<CrownIcon
									className="text-primary"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<div className="font-medium">
									{currentPlan?.display?.name || currentPlan?.name || "Free"}
								</div>
								{!isFree && currentPlan?.items[0]?.display?.primary_text && (
									<div className="text-muted-foreground text-sm">
										{currentPlan.items[0].display.primary_text}
									</div>
								)}
							</div>
						</div>
						{statusDetails && (
							<div className="mt-3 flex items-center gap-2 text-muted-foreground text-sm">
								<CalendarIcon size={14} weight="duotone" />
								{statusDetails}
							</div>
						)}
					</div>

					{/* Payment Method + Actions */}
					<div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:p-0">
						{/* Payment Method */}
						<div className="w-full lg:w-auto lg:border-b lg:p-5">
							<h3 className="mb-3 font-semibold">Payment Method</h3>
							<CreditCardDisplay customer={customer} />
						</div>

						{/* Actions */}
						<div className="flex w-full flex-col gap-2 lg:w-auto lg:p-5">
							{isCanceled ? (
								<Button asChild className="w-full">
									<Link href="/billing/plans">Reactivate Plan</Link>
								</Button>
							) : isFree ? (
								<Button asChild className="w-full">
									<Link href="/billing/plans">Upgrade Plan</Link>
								</Button>
							) : (
								<>
									<Button asChild className="w-full" variant="outline">
										<Link href="/billing/plans">Change Plan</Link>
									</Button>
									<Button
										className="w-full"
										onClick={() =>
											currentPlan &&
											onCancelClick(
												currentPlan.id,
												currentPlan.display?.name || currentPlan.name,
												currentProduct?.current_period_end ?? undefined
											)
										}
										variant="outline"
									>
										Cancel Plan
									</Button>
								</>
							)}
							<Button
								className="w-full"
								onClick={onManageBilling}
								variant="outline"
							>
								Billing Portal
								<ArrowSquareOutIcon className="ml-2" size={14} />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}

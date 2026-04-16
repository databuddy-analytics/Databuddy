"use client";

import { EmptyState } from "@/components/empty-state";
import { useBillingContext } from "@/components/providers/billing-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";
import type { UsageResponse } from "@databuddy/shared/types/billing";
import {
	ArrowSquareOutIcon,
	CalendarIcon,
	CrownIcon,
	PlusIcon,
	PuzzlePieceIcon,
	TrendUpIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { CancelSubscriptionDialog } from "./components/cancel-subscription-dialog";
import { ConsumptionChart } from "./components/consumption-chart";
import { CreditCardDisplay } from "./components/credit-card-display";
import { ErrorState } from "./components/empty-states";
import { OverviewSkeleton } from "./components/overview-skeleton";
import { UsageBreakdownTable } from "./components/usage-breakdown-table";
import { UsageRow } from "./components/usage-row";
import { useBilling, useBillingData } from "./hooks/use-billing";
import type { OverageInfo } from "./utils/billing-utils";

interface OrgUsageData {
	balance?: number | null;
	includedUsage?: number | null;
	unlimited: boolean;
}

function getDefaultDateRange() {
	const end = new Date();
	const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	return {
		startDate: start.toISOString().split("T")[0],
		endDate: end.toISOString().split("T")[0],
	};
}

function calculateOverageInfo(
	balance: number,
	includedUsage: number,
	unlimited: boolean
): OverageInfo {
	if (unlimited || balance >= 0) {
		return {
			hasOverage: false,
			overageEvents: 0,
			includedEvents: includedUsage,
		};
	}
	return {
		hasOverage: true,
		overageEvents: Math.abs(balance),
		includedEvents: includedUsage,
	};
}

function isSSOPlan(plan: { id: string; name: string }): boolean {
	const id = plan.id.toLowerCase();
	if (id === "sso" || id.includes("sso")) {
		return true;
	}
	return plan.name.toLowerCase().includes("single sign-on");
}

function getAddOnStatus(
	plan: { customerEligibility?: { status?: string } | null },
	subscription?: {
		canceledAt?: number | null;
		currentPeriodEnd?: number | null;
		status?: string;
	}
) {
	const isCancelled =
		subscription?.canceledAt &&
		subscription?.currentPeriodEnd &&
		dayjs(subscription.currentPeriodEnd).isAfter(dayjs());

	const eligibility = plan.customerEligibility;
	const isActive =
		!isCancelled &&
		(eligibility?.status === "active" ||
			eligibility?.status === "scheduled" ||
			subscription?.status === "active" ||
			subscription?.status === "scheduled");

	return { isCancelled, isActive };
}

export default function BillingPage() {
	const { canUserUpgrade } = useBillingContext();
	const { plans, usage, customer, isLoading, error, refetch } =
		useBillingData();
	const { attach } = useCustomer();
	const [dateRange, setDateRange] = useState(getDefaultDateRange);

	const { data: breakdownUsageRaw, isLoading: isBreakdownLoading } = useQuery({
		...orpc.billing.getUsage.queryOptions({
			input: {
				startDate: dateRange.startDate,
				endDate: dateRange.endDate,
			},
		}),
	});
	const breakdownUsageData = breakdownUsageRaw as UsageResponse | undefined;

	const { data: orgUsageRaw } = useQuery({
		...orpc.organizations.getUsage.queryOptions(),
	});
	const orgUsage = orgUsageRaw as OrgUsageData | undefined;

	const overageInfo = useMemo(() => {
		if (!orgUsage) {
			return null;
		}
		return calculateOverageInfo(
			orgUsage.balance ?? 0,
			orgUsage.includedUsage ?? 0,
			orgUsage.unlimited
		);
	}, [orgUsage]);
	const {
		onCancelClick,
		onCancelConfirm,
		onCancelDialogClose,
		onManageBilling,
		showCancelDialog,
		cancelTarget,
		getSubscriptionStatusDetails,
	} = useBilling(refetch);

	const addOns = useMemo(() => {
		const allAddOns = plans?.filter((p) => p.addOn) ?? [];
		return allAddOns.filter((p) => !isSSOPlan(p));
	}, [plans]);

	const { currentPlan, currentSubscription, usageStats, statusDetails } =
		useMemo(() => {
			const activeSub = customer?.subscriptions?.find((s) => {
				if (s.canceledAt && s.currentPeriodEnd) {
					return dayjs(s.currentPeriodEnd).isAfter(dayjs());
				}
				return !s.canceledAt || s.status === "scheduled";
			});

			const activePlan = activeSub
				? plans?.find((p) => p.id === activeSub.planId)
				: plans?.find((p) => {
						const action = p.customerEligibility?.attachAction;
						return !(action && ["upgrade", "downgrade"].includes(action));
					});

			const planStatusDetails = activeSub
				? getSubscriptionStatusDetails(activeSub)
				: "";

			return {
				currentPlan: activePlan,
				currentSubscription: activeSub,
				usageStats: usage?.features ?? [],
				statusDetails: planStatusDetails,
			};
		}, [
			plans,
			usage?.features,
			customer?.subscriptions,
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

	const isFree = currentPlan?.id === "free" || currentPlan?.autoEnable === true;
	const isCanceled = currentPlan?.customerEligibility?.canceling === true;
	const isMaxPlan = currentPlan?.id === "scale";
	const showAddOns = addOns.length > 0 && !isFree;

	return (
		<main className="min-h-0 flex-1 overflow-hidden">
			<div className="flex h-full flex-col overflow-y-auto lg:grid lg:h-full lg:grid-cols-[1fr_20rem] lg:overflow-hidden">
				<CancelSubscriptionDialog
					currentPeriodEnd={cancelTarget?.currentPeriodEnd}
					isLoading={isLoading}
					onCancel={onCancelConfirm}
					onOpenChange={(open) => !open && onCancelDialogClose()}
					open={showCancelDialog}
					planName={cancelTarget?.name ?? ""}
				/>

				{/* Main Content - Usage Stats + Breakdown */}
				<div className="shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
					{usageStats.length === 0 ? (
						<EmptyState
							className="h-full"
							description="Start using features to see your consumption stats here"
							icon={<TrendUpIcon />}
							title="No usage data yet"
							variant="minimal"
						/>
					) : (
						<>
							<div className="divide-y">
								{usageStats.map((feature) => (
									<UsageRow
										feature={feature}
										isMaxPlan={isMaxPlan}
										key={feature.id}
									/>
								))}
							</div>
							<Suspense fallback={<Skeleton className="h-64 w-full" />}>
								<ConsumptionChart
									isLoading={isBreakdownLoading}
									onDateRangeChange={(start, end) =>
										setDateRange({ startDate: start, endDate: end })
									}
									overageInfo={overageInfo}
									usageData={breakdownUsageData}
								/>
							</Suspense>
							<Suspense fallback={<Skeleton className="h-64 w-full" />}>
								<UsageBreakdownTable
									isLoading={isBreakdownLoading}
									overageInfo={overageInfo}
									usageData={breakdownUsageData}
								/>
							</Suspense>
						</>
					)}
				</div>

				<div className="flex w-full shrink-0 flex-col border-t bg-card lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l">
					<div className="border-b p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="font-semibold">Current Plan</h3>
							<Badge
								variant={
									currentSubscription?.status === "scheduled"
										? "outline"
										: "green"
								}
							>
								{currentSubscription?.status === "scheduled"
									? "Scheduled"
									: "Active"}
							</Badge>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary">
								<CrownIcon
									className="text-accent-foreground"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<div className="font-medium">{currentPlan?.name || "Free"}</div>
								{!isFree && currentPlan?.price?.display?.primaryText && (
									<div className="text-muted-foreground text-sm">
										{currentPlan.price.display.primaryText}
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
						<div className="w-full lg:w-auto lg:border-b lg:p-5">
							<h3 className="mb-3 font-semibold">Payment Method</h3>
							<CreditCardDisplay customer={customer ?? null} />
						</div>

						<div className="flex w-full flex-col gap-2 lg:w-auto lg:p-5">
							{canUserUpgrade ? (
								<>
									{isCanceled ? (
										<Button asChild className="w-full" variant="outline">
											<Link href="/billing/plans">Reactivate Plan</Link>
										</Button>
									) : isFree ? (
										<Button asChild className="w-full" variant="outline">
											<Link href="/billing/plans">Upgrade Plan</Link>
										</Button>
									) : (
										<>
											<Button
												className="w-full"
												onClick={() =>
													currentPlan &&
													onCancelClick(
														currentPlan.id,
														currentPlan.name,
														currentSubscription?.currentPeriodEnd ?? undefined
													)
												}
												variant="outline"
											>
												Cancel Plan
											</Button>
											<Button asChild className="w-full" variant="outline">
												<Link href="/billing/plans">Change Plan</Link>
											</Button>
										</>
									)}
									<Button className="w-full" onClick={onManageBilling}>
										Billing Portal
										<ArrowSquareOutIcon size={14} />
									</Button>
								</>
							) : (
								<p className="text-pretty text-muted-foreground text-sm">
									Billing is managed by your{" "}
									<Link
										className="font-medium text-foreground underline underline-offset-2"
										href="/organizations/members"
									>
										org admin
									</Link>
									.
								</p>
							)}
						</div>
					</div>

					{showAddOns && (
						<div className="border-t p-5">
							<div className="mb-3 flex items-center gap-2">
								<PuzzlePieceIcon
									className="text-muted-foreground"
									size={16}
									weight="duotone"
								/>
								<h3 className="font-semibold">Enterprise Add-ons</h3>
							</div>
							<div className="space-y-2">
								{addOns.map((addOn) => {
									const sub = customer?.subscriptions?.find(
										(s) => s.planId === addOn.id
									);
									const { isCancelled, isActive } = getAddOnStatus(addOn, sub);
									const priceDisplay = addOn.items.at(0)?.display;

									return (
										<div
											className="flex items-center justify-between gap-3 rounded border bg-secondary/50 p-3"
											key={addOn.id}
										>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium text-sm">
													{addOn.name}
												</div>
												<div className="text-muted-foreground text-xs">
													{isCancelled && sub?.currentPeriodEnd
														? `Access until ${dayjs(sub.currentPeriodEnd).format("MMM D, YYYY")}`
														: priceDisplay?.primaryText &&
															`${priceDisplay.primaryText}${priceDisplay.secondaryText ? ` ${priceDisplay.secondaryText}` : ""}`}
												</div>
											</div>
											{isCancelled ? (
												<Badge variant="outline">Cancelled</Badge>
											) : isActive ? (
												<div className="flex items-center gap-2">
													<Badge variant="green">Active</Badge>
													{canUserUpgrade && (
														<Button
															onClick={() =>
																onCancelClick(
																	addOn.id,
																	addOn.name,
																	sub?.currentPeriodEnd ?? undefined
																)
															}
															size="sm"
															variant="ghost"
														>
															<XIcon size={14} />
														</Button>
													)}
												</div>
											) : canUserUpgrade ? (
												<Button
													onClick={() =>
														attach({
															planId: addOn.id,
														})
													}
													size="sm"
													variant="outline"
												>
													<PlusIcon size={14} />
													Add
												</Button>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}

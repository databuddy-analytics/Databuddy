"use client";

import {
	ArrowSquareOutIcon,
	CalendarIcon,
	CrownIcon,
	PlusIcon,
	PuzzlePieceIcon,
	TrendUpIcon,
	XIcon,
} from "@phosphor-icons/react";
import type { CustomerProduct, Product } from "autumn-js";
import { useCustomer } from "autumn-js/react";
import dayjs from "dayjs";
import Link from "next/link";
import { useMemo } from "react";
import AttachDialog from "@/components/autumn/attach-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelSubscriptionDialog } from "./components/cancel-subscription-dialog";
import { CreditCardDisplay } from "./components/credit-card-display";
import { ErrorState } from "./components/empty-states";
import { OverviewSkeleton } from "./components/overview-skeleton";
import { UsageRow } from "./components/usage-row";
import { useBilling, useBillingData } from "./hooks/use-billing";

type AddOnProduct = Product & { is_add_on?: boolean };

function isSSOProduct(product: Product): boolean {
	const id = product.id.toLowerCase();
	if (id === "sso" || id.includes("sso")) {
		return true;
	}
	const name = product.name.toLowerCase();
	if (name.includes("single sign-on")) {
		return true;
	}
	const displayName = product.display?.name?.toLowerCase() ?? "";
	return displayName.includes("single sign-on");
}

function getAddOnStatus(addOn: Product, customerProduct?: CustomerProduct) {
	const isCancelled =
		customerProduct?.canceled_at &&
		customerProduct?.current_period_end &&
		dayjs(customerProduct.current_period_end).isAfter(dayjs());

	const isActive =
		!isCancelled &&
		(addOn.scenario === "active" ||
			addOn.scenario === "scheduled" ||
			customerProduct?.status === "active" ||
			customerProduct?.status === "scheduled");

	return { isCancelled, isActive };
}

export default function BillingPage() {
	const { products, usage, customer, isLoading, error, refetch } =
		useBillingData();
	const { attach } = useCustomer();
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
		const allAddOns =
			products?.filter((p) => (p as AddOnProduct).is_add_on) ?? [];
		return allAddOns.filter((p) => !isSSOProduct(p));
	}, [products]);

	const { currentPlan, currentProduct, usageStats, statusDetails } =
		useMemo(() => {
			const activeCustomerProduct = customer?.products?.find((p) => {
				if (p.canceled_at && p.current_period_end) {
					return dayjs(p.current_period_end).isAfter(dayjs());
				}
				return !p.canceled_at || p.status === "scheduled";
			});

			const activePlan = activeCustomerProduct
				? products?.find((p) => p.id === activeCustomerProduct.id)
				: products?.find(
						(p) =>
							!(p.scenario && ["upgrade", "downgrade"].includes(p.scenario))
					);

			const planStatusDetails = activeCustomerProduct
				? getSubscriptionStatusDetails(
						activeCustomerProduct as Parameters<
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

				{/* Main Content - Usage Stats */}
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
						<div className="divide-y">
							{usageStats.map((feature) => (
								<UsageRow feature={feature} key={feature.id} />
							))}
						</div>
					)}
				</div>

				{/* Sidebar */}
				<div className="flex w-full shrink-0 flex-col border-t bg-card lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l">
					{/* Current Plan */}
					<div className="border-b p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="font-semibold">Current Plan</h3>
							<Badge
								variant={
									currentProduct?.status === "scheduled" ? "outline" : "green"
								}
							>
								{currentProduct?.status === "scheduled"
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
						<div className="w-full lg:w-auto lg:border-b lg:p-5">
							<h3 className="mb-3 font-semibold">Payment Method</h3>
							<CreditCardDisplay customer={customer} />
						</div>

						<div className="flex w-full flex-col gap-2 lg:w-auto lg:p-5">
							{isCanceled ? (
								<Button asChild className="w-full" variant="secondary">
									<Link href="/billing/plans">Reactivate Plan</Link>
								</Button>
							) : isFree ? (
								<Button asChild className="w-full" variant="secondary">
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
												currentPlan.display?.name || currentPlan.name,
												currentProduct?.current_period_end ?? undefined
											)
										}
										variant="outline"
									>
										Cancel Plan
									</Button>
									<Button asChild className="w-full" variant="secondary">
										<Link href="/billing/plans">Change Plan</Link>
									</Button>
								</>
							)}
							<Button className="w-full" onClick={onManageBilling}>
								Billing Portal
								<ArrowSquareOutIcon size={14} />
							</Button>
						</div>
					</div>

					{/* Enterprise Add-ons */}
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
									const customerProduct = customer?.products?.find(
										(cp) => cp.id === addOn.id
									);
									const { isCancelled, isActive } = getAddOnStatus(
										addOn,
										customerProduct
									);
									const priceDisplay = addOn.items[0]?.display;

									return (
										<div
											className="flex items-center justify-between gap-3 rounded border bg-secondary/50 p-3"
											key={addOn.id}
										>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium text-sm">
													{addOn.display?.name || addOn.name}
												</div>
												<div className="text-muted-foreground text-xs">
													{isCancelled && customerProduct?.current_period_end
														? `Access until ${dayjs(customerProduct.current_period_end).format("MMM D, YYYY")}`
														: priceDisplay?.primary_text &&
															`${priceDisplay.primary_text}${priceDisplay.secondary_text ? ` ${priceDisplay.secondary_text}` : ""}`}
												</div>
											</div>
											{isCancelled ? (
												<Badge variant="outline">Cancelled</Badge>
											) : isActive ? (
												<div className="flex items-center gap-2">
													<Badge variant="green">Active</Badge>
													<Button
														onClick={() =>
															onCancelClick(
																addOn.id,
																addOn.display?.name || addOn.name,
																customerProduct?.current_period_end ?? undefined
															)
														}
														size="sm"
														variant="ghost"
													>
														<XIcon size={14} />
													</Button>
												</div>
											) : (
												<Button
													onClick={() =>
														attach({
															productId: addOn.id,
															dialog: AttachDialog,
														})
													}
													size="sm"
													variant="outline"
												>
													<PlusIcon size={14} />
													Add
												</Button>
											)}
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

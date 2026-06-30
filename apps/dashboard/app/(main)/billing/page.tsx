"use client";

import AttachDialog from "@/components/autumn/attach-dialog";
import { useBillingContext } from "@/components/providers/billing-provider";
import { orpc } from "@/lib/orpc";
import { TOPUP_PRODUCT_ID } from "@/lib/topup-math";
import type { UsageResponse } from "@/types/billing";
import { useQuery } from "@tanstack/react-query";
import type { PreviewAttachResponse } from "autumn-js";
import { useCustomer } from "autumn-js/react";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { BillingControlsCard } from "./components/billing-controls-card";
import { CancelSubscriptionDialog } from "./components/cancel-subscription-dialog";
import { ConsumptionChart } from "./components/consumption-chart";
import { ErrorState } from "./components/empty-states";
import { TopupCard } from "./components/topup-card";
import { UsageBreakdownTable } from "./components/usage-breakdown-table";
import { UsageRow } from "./components/usage-row";
import { useBilling, useBillingData } from "./hooks/use-billing";
import type { CustomerWithPaymentMethod } from "./types/billing";
import type { OverageInfo } from "./utils/billing-utils";
import {
	ArrowSquareOutIcon,
	CalendarIcon,
	CommandIcon as PuzzlePieceIcon,
	CreditCardIcon,
	CrownIcon,
	PlusIcon,
	TrendUpIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import {
	Badge,
	Button,
	Card,
	Divider,
	EmptyState,
	Skeleton,
	Text,
	dayjs,
} from "@databuddy/ui";

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

interface AddOnPriceDisplay {
	primaryText?: string;
	secondaryText?: string;
}

function formatPriceDisplay(display?: AddOnPriceDisplay | null): string | null {
	if (!display?.primaryText) {
		return null;
	}
	return display.secondaryText
		? `${display.primaryText} ${display.secondaryText}`
		: display.primaryText;
}

interface AddOn {
	id: string;
	items: { display?: AddOnPriceDisplay | null }[];
	name: string;
	price?: { display?: AddOnPriceDisplay | null } | null;
}

interface AddOnSubscription {
	canceledAt?: number | null;
	currentPeriodEnd?: number | null;
	status?: string;
}

interface AddOnRowProps {
	addOn: AddOn;
	canUserUpgrade: boolean;
	isActive: boolean;
	isCancelled: boolean | null | undefined;
	onAttach: (planId: string) => Promise<void>;
	onCancel: () => void;
	onPreview: (planId: string) => Promise<PreviewAttachResponse>;
	subscription?: AddOnSubscription;
}

function AddOnRow({
	addOn,
	canUserUpgrade,
	isActive,
	isCancelled,
	onAttach,
	onCancel,
	onPreview,
	subscription,
}: AddOnRowProps) {
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [preview, setPreview] = useState<PreviewAttachResponse | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const priceText = formatPriceDisplay(addOn.price?.display);
	const benefitText = formatPriceDisplay(addOn.items.at(0)?.display);

	const description =
		isCancelled && subscription?.currentPeriodEnd
			? `Access until ${dayjs(subscription.currentPeriodEnd).format("MMM D, YYYY")}`
			: [priceText, benefitText].filter(Boolean).join(" · ");

	const handleAddClick = async () => {
		setIsLoadingPreview(true);
		try {
			const result = await onPreview(addOn.id);
			setPreview(result);
			setDialogOpen(true);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to load preview."
			);
		} finally {
			setIsLoadingPreview(false);
		}
	};

	return (
		<>
			<div className="flex items-center justify-between gap-3 px-5 py-3">
				<div className="min-w-0 flex-1">
					<Text className="truncate" variant="label">
						{addOn.name}
					</Text>
					{description && (
						<Text tone="muted" variant="caption">
							{description}
						</Text>
					)}
				</div>
				{isCancelled ? (
					<Badge variant="muted">Cancelled</Badge>
				) : isActive ? (
					<div className="flex items-center gap-2">
						<Badge variant="success">Active</Badge>
						{canUserUpgrade && (
							<Button
								aria-label={`Cancel ${addOn.name}`}
								onClick={onCancel}
								size="sm"
								variant="ghost"
							>
								<XIcon size={14} />
							</Button>
						)}
					</div>
				) : canUserUpgrade ? (
					<Button
						disabled={isLoadingPreview}
						onClick={handleAddClick}
						size="sm"
						variant="secondary"
					>
						{isLoadingPreview ? (
							"Loading…"
						) : (
							<>
								<PlusIcon size={14} />
								Add
							</>
						)}
					</Button>
				) : null}
			</div>
			{preview && (
				<AttachDialog
					onConfirm={() => onAttach(addOn.id)}
					open={dialogOpen}
					planId={addOn.id}
					preview={preview}
					setOpen={setDialogOpen}
				/>
			)}
		</>
	);
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
	const router = useRouter();
	const { canUserUpgrade } = useBillingContext();
	const { plans, usage, customer, isLoading, error, refetch } =
		useBillingData();
	const { attach, previewAttach } = useCustomer();
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
		return allAddOns.filter((p) => !isSSOPlan(p) && p.id !== TOPUP_PRODUCT_ID);
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
			<main className="min-h-0 flex-1 overflow-y-auto">
				<OverviewSkeleton />
			</main>
		);
	}

	if (error) {
		return (
			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl p-5">
					<ErrorState error={error} onRetry={refetch} />
				</div>
			</main>
		);
	}

	const isFree = currentPlan?.id === "free" || currentPlan?.autoEnable === true;
	const isCanceled = currentPlan?.customerEligibility?.canceling === true;
	const isMaxPlan = currentPlan?.id === "scale";
	const showAddOns = addOns.length > 0 && !isFree;

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<CancelSubscriptionDialog
				currentPeriodEnd={cancelTarget?.currentPeriodEnd}
				isLoading={isLoading}
				onCancel={onCancelConfirm}
				onOpenChange={(open) => !open && onCancelDialogClose()}
				open={showCancelDialog}
				planName={cancelTarget?.name ?? ""}
			/>

			<div className="mx-auto max-w-2xl space-y-6 p-5">
				<Card>
					<Card.Header className="flex-row items-start justify-between gap-4">
						<div>
							<Card.Title>Current Plan</Card.Title>
							<Card.Description>
								Subscription and billing management
							</Card.Description>
						</div>
						<Badge
							variant={
								currentSubscription?.status === "scheduled"
									? "muted"
									: "success"
							}
						>
							{currentSubscription?.status === "scheduled"
								? "Scheduled"
								: "Active"}
						</Badge>
					</Card.Header>
					<Card.Content className="space-y-4">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary">
									<CrownIcon
										className="text-accent-foreground"
										size={16}
										weight="duotone"
									/>
								</div>
								<div>
									<Text variant="label">{currentPlan?.name || "Free"}</Text>
									{!isFree && currentPlan?.price?.display?.primaryText && (
										<Text tone="muted" variant="caption">
											{currentPlan.price.display.primaryText}
										</Text>
									)}
								</div>
							</div>
							{statusDetails && (
								<div className="flex items-center gap-1.5">
									<CalendarIcon className="text-muted-foreground" size={12} />
									<Text tone="muted" variant="caption">
										{statusDetails}
									</Text>
								</div>
							)}
						</div>

						<Divider />

						<PaymentMethodRow customer={customer ?? null} />

						<Divider />

						<div className="flex flex-wrap gap-2">
							{canUserUpgrade ? (
								<>
									{isCanceled ? (
										<Button
											onClick={() => router.push("/billing/plans")}
											size="sm"
											variant="secondary"
										>
											Reactivate Plan
										</Button>
									) : isFree ? (
										<Button
											onClick={() => router.push("/billing/plans")}
											size="sm"
											variant="secondary"
										>
											Upgrade Plan
										</Button>
									) : (
										<>
											<Button
												onClick={() => router.push("/billing/plans")}
												size="sm"
												variant="secondary"
											>
												Change Plan
											</Button>
											<Button
												onClick={() =>
													currentPlan &&
													onCancelClick(
														currentPlan.id,
														currentPlan.name,
														currentSubscription?.currentPeriodEnd ?? undefined
													)
												}
												size="sm"
												variant="ghost"
											>
												Cancel Plan
											</Button>
										</>
									)}
									<Button
										onClick={onManageBilling}
										size="sm"
										variant="secondary"
									>
										Billing Portal
										<ArrowSquareOutIcon size={14} />
									</Button>
								</>
							) : (
								<Text tone="muted" variant="caption">
									Billing is managed by your{" "}
									<a
										className="font-medium text-foreground underline underline-offset-2"
										href="/organizations/members"
									>
										org admin
									</a>
									.
								</Text>
							)}
						</div>
					</Card.Content>
				</Card>

				{!isFree && <TopupCard />}
				{!isFree && <BillingControlsCard />}

				{showAddOns && (
					<Card>
						<Card.Header>
							<Card.Title className="flex items-center gap-2">
								<PuzzlePieceIcon
									className="text-muted-foreground"
									size={14}
									weight="duotone"
								/>
								Enterprise Add-ons
							</Card.Title>
							<Card.Description>
								Additional features for your plan
							</Card.Description>
						</Card.Header>
						<Card.Content className="p-0">
							<div className="divide-y">
								{addOns.map((addOn) => {
									const sub = customer?.subscriptions?.find(
										(s) => s.planId === addOn.id
									);
									const { isCancelled, isActive } = getAddOnStatus(addOn, sub);

									return (
										<AddOnRow
											addOn={addOn}
											canUserUpgrade={canUserUpgrade}
											isActive={isActive}
											isCancelled={Boolean(isCancelled)}
											key={addOn.id}
											onAttach={async (planId) => {
												try {
													const result = await attach({
														planId,
														successUrl: `${window.location.origin}/billing`,
													});
													if (result?.paymentUrl) {
														window.location.href = result.paymentUrl;
														return;
													}
													refetch();
													toast.success("Add-on attached");
												} catch (err) {
													toast.error(
														err instanceof Error
															? err.message
															: "Failed to attach add-on."
													);
												}
											}}
											onCancel={() =>
												onCancelClick(
													addOn.id,
													addOn.name,
													sub?.currentPeriodEnd ?? undefined
												)
											}
											onPreview={async (planId) => {
												const result = await previewAttach({ planId });
												return result as unknown as PreviewAttachResponse;
											}}
											subscription={sub}
										/>
									);
								})}
							</div>
						</Card.Content>
					</Card>
				)}

				{usageStats.length === 0 ? (
					<Card>
						<Card.Content className="py-8">
							<EmptyState
								description="Start using features to see your consumption stats here"
								icon={<TrendUpIcon weight="duotone" />}
								title="No usage data yet"
							/>
						</Card.Content>
					</Card>
				) : (
					<>
						<Card>
							<Card.Header>
								<Card.Title>Usage</Card.Title>
								<Card.Description>
									Feature consumption for this billing period
								</Card.Description>
							</Card.Header>
							<Card.Content className="p-0">
								{usageStats.map((feature) => (
									<UsageRow
										feature={feature}
										isMaxPlan={isMaxPlan}
										key={feature.id}
									/>
								))}
							</Card.Content>
						</Card>

						<Suspense
							fallback={<Skeleton className="h-64 w-full rounded-lg" />}
						>
							<ConsumptionChart
								isLoading={isBreakdownLoading}
								onDateRangeChange={(start, end) =>
									setDateRange({ startDate: start, endDate: end })
								}
								overageInfo={overageInfo}
								usageData={breakdownUsageData}
							/>
						</Suspense>
						<Suspense
							fallback={<Skeleton className="h-64 w-full rounded-lg" />}
						>
							<UsageBreakdownTable
								isLoading={isBreakdownLoading}
								overageInfo={overageInfo}
								usageData={breakdownUsageData}
							/>
						</Suspense>
					</>
				)}
			</div>
		</main>
	);
}

function PaymentMethodRow({
	customer,
}: {
	customer: CustomerWithPaymentMethod | null;
}) {
	const card = customer?.paymentMethod?.card;

	if (!card) {
		return (
			<div className="flex items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed bg-secondary">
					<CreditCardIcon
						className="text-muted-foreground"
						size={16}
						weight="duotone"
					/>
				</div>
				<Text tone="muted" variant="caption">
					No payment method on file
				</Text>
			</div>
		);
	}

	const last4 = card.last4 || "****";
	const expMonth = card.expMonth?.toString().padStart(2, "0") || "00";
	const expYear = card.expYear?.toString().slice(-2) || "00";
	const brand =
		(card.brand || "card").charAt(0).toUpperCase() +
		(card.brand || "card").slice(1);

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-secondary">
					<CreditCardIcon
						className="text-accent-foreground"
						size={16}
						weight="duotone"
					/>
				</div>
				<div>
					<Text variant="label">
						{brand} ending in {last4}
					</Text>
					<Text tone="muted" variant="caption">
						Expires {expMonth}/{expYear}
					</Text>
				</div>
			</div>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div className="mx-auto max-w-2xl space-y-6 p-5">
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div className="space-y-1">
						<Skeleton className="h-3.5 w-24" />
						<Skeleton className="h-3 w-48" />
					</div>
					<Skeleton className="h-5 w-14 rounded-full" />
				</Card.Header>
				<Card.Content className="space-y-4">
					<div className="flex items-center gap-3">
						<Skeleton className="size-9 rounded-lg" />
						<div className="space-y-1">
							<Skeleton className="h-3.5 w-20" />
							<Skeleton className="h-3 w-28" />
						</div>
					</div>
					<Skeleton className="h-px w-full" />
					<div className="flex items-center gap-3">
						<Skeleton className="size-9 rounded-lg" />
						<div className="space-y-1">
							<Skeleton className="h-3.5 w-36" />
							<Skeleton className="h-3 w-20" />
						</div>
					</div>
					<Skeleton className="h-px w-full" />
					<div className="flex gap-2">
						<Skeleton className="h-7 w-24 rounded" />
						<Skeleton className="h-7 w-28 rounded" />
					</div>
				</Card.Content>
			</Card>

			<Card>
				<Card.Header>
					<Skeleton className="h-3.5 w-14" />
					<Skeleton className="h-3 w-52" />
				</Card.Header>
				<Card.Content className="p-0">
					{[1, 2, 3].map((i) => (
						<div className="border-b p-5 last:border-b-0" key={i}>
							<div className="mb-3 flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Skeleton className="size-10 rounded" />
									<div className="space-y-1">
										<Skeleton className="h-3.5 w-24" />
										<Skeleton className="h-3 w-32" />
									</div>
								</div>
								<Skeleton className="h-3.5 w-20" />
							</div>
							<Skeleton className="h-2 w-full rounded-full" />
						</div>
					))}
				</Card.Content>
			</Card>
		</div>
	);
}

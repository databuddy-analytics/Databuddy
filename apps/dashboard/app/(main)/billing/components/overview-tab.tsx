'use client';

import {
	ArrowSquareOutIcon,
	CalendarIcon,
	ChartBarIcon,
	CheckIcon,
	ClockIcon,
	CreditCardIcon,
	CrownIcon,
	DatabaseIcon,
	LightningIcon,
	SparkleIcon,
	TrendUpIcon,
	UsersIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { useBilling } from '@/app/(main)/billing/hooks/use-billing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
	type FeatureUsage,
	type Plan,
	useBillingData,
} from '../data/billing-data';
import { CancelSubscriptionDialog } from './cancel-subscription-dialog';
import { NoPaymentMethodDialog } from './no-payment-method-dialog';

function UsageCard({
	feature,
	onUpgrade,
}: {
	feature: FeatureUsage;
	onUpgrade: () => void;
}) {
	const percentage =
		feature.limit > 0 ? Math.min((feature.used / feature.limit) * 100, 100) : 0;
	const isUnlimited = !Number.isFinite(feature.limit);
	const isNearLimit = !isUnlimited && percentage > 80;
	const isOverLimit = !isUnlimited && percentage >= 100;

	const getIcon = () => {
		if (feature.name.toLowerCase().includes('event')) {
			return ChartBarIcon;
		}
		if (feature.name.toLowerCase().includes('storage')) {
			return DatabaseIcon;
		}
		if (
			feature.name.toLowerCase().includes('user') ||
			feature.name.toLowerCase().includes('member')
		) {
			return UsersIcon;
		}
		return ChartBarIcon;
	};

	const Icon = getIcon();

	return (
		<Card
			className={cn(
				'h-full',
				isOverLimit && 'border-destructive',
				isNearLimit && !isOverLimit && 'border-orange-500'
			)}
		>
			<CardHeader className="pb-4">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-12 w-12 items-center justify-center rounded border">
							<Icon className="h-6 w-6 text-muted-foreground" />
						</div>
						<div>
							<CardTitle className="font-semibold text-lg">
								{feature.name}
							</CardTitle>
							<p className="text-muted-foreground text-sm">Current usage</p>
						</div>
					</div>

					<div className="text-right">
						{isUnlimited ? (
							<Badge>
								<LightningIcon className="mr-1" size={12} />
								Unlimited
							</Badge>
						) : (
							<div>
								<div
									className={cn(
										'font-bold text-2xl',
										isOverLimit
											? 'text-destructive'
											: isNearLimit
												? 'text-orange-500'
												: 'text-foreground'
									)}
								>
									{feature.used.toLocaleString()}
									<span className="ml-1 font-normal text-muted-foreground text-sm">
										/ {feature.limit.toLocaleString()}
									</span>
								</div>
								{feature.hasOverage &&
									feature.overageAmount &&
									feature.overageAmount > 0 && (
										<div className="font-medium text-destructive text-sm">
											+${feature.overageAmount.toFixed(2)}
										</div>
									)}
							</div>
						)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				{!isUnlimited && (
					<div className="space-y-3">
						<Progress className="h-3" value={percentage} />

						<div className="flex items-center justify-between text-muted-foreground text-xs">
							<div className="flex items-center gap-1">
								<ClockIcon size={12} />
								{feature.interval ? (
									<span>
										Resets{' '}
										{feature.interval === 'day'
											? 'daily'
											: feature.interval === 'month'
												? 'monthly'
												: feature.interval === 'year'
													? 'yearly'
													: feature.nextReset}
									</span>
								) : (
									<span>Resets {feature.nextReset}</span>
								)}
							</div>

							{isNearLimit && (
								<Button
									className="h-auto cursor-pointer p-0 font-medium text-xs hover:underline"
									onClick={onUpgrade}
									size="sm"
									variant="link"
								>
									{isOverLimit ? 'Upgrade' : 'Upgrade'}
								</Button>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function PlanStatusCard({
	plan,
	statusDetails,
	onUpgrade,
	onCancelClick,
	onManageBilling,
}: {
	plan: Plan | undefined;
	statusDetails: string;
	onUpgrade: () => void;
	onCancelClick: (
		planId: string,
		planName: string,
		currentPeriodEnd?: number
	) => void;
	onManageBilling: () => void;
}) {
	const isCanceled = plan?.status === 'canceled' || plan?.canceled_at;
	const isScheduled = plan?.status === 'scheduled';
	const isFree = plan?.id === 'free';

	const getStatusBadge = () => {
		if (isCanceled) {
			return (
				<Badge variant="destructive">
					<WarningIcon className="mr-1" size={12} />
					Cancelled
				</Badge>
			);
		}
		if (isScheduled) {
			return (
				<Badge className="bg-blue-500 text-white">
					<CalendarIcon className="mr-1" size={12} />
					Scheduled
				</Badge>
			);
		}
		return (
			<Badge>
				<CheckIcon className="mr-1" size={12} />
				Active
			</Badge>
		);
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<div className="flex h-12 w-12 items-center justify-center rounded border">
								<CrownIcon className="text-muted-foreground" size={24} />
							</div>
							<div>
								<CardTitle className="font-semibold text-xl">
									{plan?.name || 'Free Plan'}
								</CardTitle>
								<p className="text-muted-foreground text-sm">
									Current subscription
								</p>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{getStatusBadge()}
							{statusDetails && (
								<span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
									{statusDetails}
								</span>
							)}
						</div>
					</div>

					<div className="text-right">
						<div className="font-bold text-3xl">
							{plan?.price.primary_text || 'Free'}
						</div>
						<div className="flex items-center gap-1 text-muted-foreground text-sm">
							{plan?.price.secondary_text}
						</div>
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-6">
				<div className="space-y-3">
					{plan?.items.map((item) => {
						const getFeatureText = () => {
							let mainText = item.primary_text || '';

							// Add interval information if it exists and isn't already in the text
							if (
								item.interval &&
								!mainText.toLowerCase().includes('per ') &&
								!mainText.toLowerCase().includes('/')
							) {
								if (item.interval === 'day') {
									mainText += ' per day';
								} else if (item.interval === 'month') {
									mainText += ' per month';
								} else if (item.interval === 'year') {
									mainText += ' per year';
								}
							}

							return mainText;
						};

						return (
							<div className="flex items-start gap-3" key={item.feature_id}>
								<div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted">
									<CheckIcon className="text-foreground" size={12} />
								</div>
								<div className="min-w-0 flex-1">
									<span className="font-medium text-sm">
										{getFeatureText()}
									</span>
									{item.secondary_text && (
										<p className="mt-0.5 text-muted-foreground text-xs">
											{item.secondary_text}
										</p>
									)}
								</div>
							</div>
						);
					})}
				</div>

				<Separator />

				<div className="space-y-3">
					{isCanceled ? (
						<Button
							className="w-full cursor-pointer"
							onClick={onUpgrade}
							size="lg"
						>
							<TrendUpIcon className="mr-2" size={16} />
							Reactivate Subscription
						</Button>
					) : (
						<div className="space-y-2">
							{isFree && (
								<Button
									className="w-full cursor-pointer"
									onClick={onUpgrade}
									size="lg"
								>
									<TrendUpIcon className="mr-2" size={16} />
									Upgrade Plan
								</Button>
							)}
							{!(isFree || isCanceled) && (
								<Button
									className="w-full cursor-pointer border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
									onClick={() =>
										plan &&
										onCancelClick(plan.id, plan.name, plan.current_period_end)
									}
									size="sm"
									variant="outline"
								>
									Cancel Subscription
								</Button>
							)}
						</div>
					)}

					<Button
						className="w-full cursor-pointer"
						onClick={onManageBilling}
						size="sm"
						variant="outline"
					>
						<CreditCardIcon className="mr-2" size={16} />
						Manage Billing
						<ArrowSquareOutIcon className="ml-2" size={12} />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export function OverviewTab({
	onNavigateToPlans,
}: {
	onNavigateToPlans: () => void;
}) {
	const { subscriptionData, usage, customerData, isLoading, refetch } =
		useBillingData();
	const {
		onCancelClick,
		onCancelConfirm,
		onManageBilling,
		showNoPaymentDialog,
		setShowNoPaymentDialog,
		showCancelDialog,
		setShowCancelDialog,
		cancellingPlan,
		getSubscriptionStatusDetails,
	} = useBilling(refetch);

	if (isLoading) {
		return (
			<div className="space-y-8">
				<div className="grid gap-8 lg:grid-cols-3">
					<div className="space-y-6 lg:col-span-2">
						<Skeleton className="h-8 w-48" />
						<div className="grid gap-4">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton className="h-32 w-full" key={`skeleton-${i + 1}`} />
							))}
						</div>
					</div>
					<div className="lg:col-span-1">
						<Skeleton className="h-96 w-full" />
					</div>
				</div>
			</div>
		);
	}

	const currentPlan = subscriptionData?.list?.find(
		(p: Plan) => p.scenario === 'active'
	);
	const usageStats = usage?.features || [];

	const statusDetails =
		currentPlan && customerData?.products?.find((p) => p.id === currentPlan.id)
			? getSubscriptionStatusDetails(
					customerData.products.find((p) => p.id === currentPlan.id) as any
				)
			: '';

	return (
		<>
			<NoPaymentMethodDialog
				onConfirm={onManageBilling}
				onOpenChange={setShowNoPaymentDialog}
				open={showNoPaymentDialog}
			/>

			<CancelSubscriptionDialog
				currentPeriodEnd={cancellingPlan?.currentPeriodEnd}
				isLoading={isLoading}
				onCancel={onCancelConfirm}
				onOpenChange={setShowCancelDialog}
				open={showCancelDialog}
				planName={cancellingPlan?.name || ''}
			/>

			<div className="space-y-8">
				<div className="grid gap-8 lg:grid-cols-3">
					<div className="space-y-6 lg:col-span-2">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="font-bold text-2xl">Usage Overview</h2>
								<p className="mt-1 text-muted-foreground">
									Monitor your current usage and limits
								</p>
							</div>
							<Badge variant="secondary">
								<SparkleIcon className="mr-1" size={12} />
								Current period
							</Badge>
						</div>

						{usageStats.length === 0 ? (
							<Card>
								<CardContent className="flex flex-col items-center justify-center py-16">
									<div className="mb-6 flex h-16 w-16 items-center justify-center rounded border">
										<TrendUpIcon className="text-muted-foreground" size={32} />
									</div>
									<h3 className="mb-2 font-semibold text-xl">No Usage Data</h3>
									<p className="max-w-sm text-center text-muted-foreground">
										Start using our features to see your usage statistics here.
									</p>
								</CardContent>
							</Card>
						) : (
							<div className="grid gap-6">
								{usageStats.map((feature: FeatureUsage) => (
									<UsageCard
										feature={feature}
										key={feature.id}
										onUpgrade={onNavigateToPlans}
									/>
								))}
							</div>
						)}
					</div>

					<div className="space-y-6 lg:col-span-1">
						<div>
							<h2 className="font-bold text-xl">Current Plan</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								Manage your subscription
							</p>
						</div>

						<PlanStatusCard
							onCancelClick={onCancelClick}
							onManageBilling={onManageBilling}
							onUpgrade={onNavigateToPlans}
							plan={currentPlan}
							statusDetails={statusDetails}
						/>
					</div>
				</div>
			</div>
		</>
	);
}

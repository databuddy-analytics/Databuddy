"use client";

import { normalizeCurrencyCode } from "@databuddy/shared/currency";

import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useMediaQuery } from "@/hooks/use-media-query";
import { orpc } from "@/lib/orpc";
import {
	appendRevenueCurrencyFilter,
	formatRevenueCurrency,
} from "@/lib/revenue-currency";
import {
	hasPaymentActivity,
	hasRevenueActivity,
	paymentFailureObservationDescription,
	paymentFailureRateLabel,
	paymentFailureReasonLabel,
	type RevenueOverview,
} from "@/lib/revenue-overview";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import type { DynamicQueryRequest } from "@/types/api";
import { TopBar } from "@/components/layout/top-bar";
import { RevenueAttributionTables } from "./revenue-attribution-tables";
import { RevenueChart } from "./revenue-chart";
import { RevenueSettingsSheet } from "./revenue-settings-sheet";
import {
	ArrowClockwiseIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	GearIcon,
	ReceiptIcon,
	TrendUpIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Card, EmptyState, dayjs } from "@databuddy/ui";

interface RevenueContentProps {
	websiteId: string;
}

interface RevenueTimeSeries {
	customers: number;
	date: string;
	refund_amount: number;
	refund_count: number;
	revenue: number;
	transactions: number;
}

function padTimeSeriesData<T extends { date: string }>(
	data: T[],
	startDate: string,
	endDate: string,
	defaultValues: Omit<T, "date">
): T[] {
	if (data.length === 0) {
		return [];
	}

	const dataMap = new Map(data.map((d) => [d.date, d]));
	const result: T[] = [];
	let current = dayjs(startDate);
	const end = dayjs(endDate);

	while (current.isBefore(end) || current.isSame(end, "day")) {
		const dateStr = current.format("YYYY-MM-DD");
		const existing = dataMap.get(dateStr);

		if (existing) {
			result.push(existing);
		} else {
			result.push({ date: dateStr, ...defaultValues } as T);
		}

		current = current.add(1, "day");
	}

	return result;
}
export function RevenueContent({ websiteId }: RevenueContentProps) {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const isMobile = useMediaQuery("(max-width: 640px)");
	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const handleAddFilter = useCallback(
		(field: string, value: string) =>
			addFilterAction({ field, operator: "eq", value }),
		[addFilterAction]
	);

	const {
		data: config,
		isError: isConfigError,
		isLoading: isConfigLoading,
		refetch: refetchConfig,
	} = useQuery(orpc.revenue.get.queryOptions({ input: { websiteId } }));
	const currency = normalizeCurrencyCode(config?.currency);
	const revenueQueryEnabled = !isConfigLoading && currency !== null;
	const displayCurrency = currency ?? "";
	const revenueFilters = useMemo(
		() => appendRevenueCurrencyFilter(filters, currency),
		[filters, currency]
	);

	const queries = useMemo<DynamicQueryRequest[]>(
		() => [
			{
				id: "revenue-overview",
				parameters: ["revenue_overview"],
				filters: revenueFilters,
			},
			{
				id: "revenue-time-series",
				parameters: ["revenue_time_series"],
				filters: revenueFilters,
			},
		],
		[revenueFilters]
	);

	const {
		getDataForQuery,
		isError: isRevenueError,
		isLoading: isRevenueLoading,
		refetch: refetchRevenue,
	} = useBatchDynamicQuery(websiteId, dateRange, queries, {
		enabled: revenueQueryEnabled,
	});
	const isLoading = isConfigLoading || isRevenueLoading;
	const hasError = isConfigError || isRevenueError;

	const handleRetry = async () => {
		const retries: Promise<unknown>[] = [];
		if (isConfigError) {
			retries.push(refetchConfig());
		}
		if (isRevenueError) {
			retries.push(refetchRevenue());
		}
		await Promise.all(retries);
	};

	const overviewData = (getDataForQuery(
		"revenue-overview",
		"revenue_overview"
	) ?? []) as RevenueOverview[];
	const timeSeriesData = (getDataForQuery(
		"revenue-time-series",
		"revenue_time_series"
	) ?? []) as RevenueTimeSeries[];

	const overview = overviewData[0];
	const hasData = hasRevenueActivity(overview);
	const hasPaymentData = hasPaymentActivity(overview);
	const isConfigured = config?.stripeConfigured || config?.paddleConfigured;
	const hasInvalidCurrency = config != null && currency === null;

	const paddedTimeSeriesData = useMemo(
		() =>
			padTimeSeriesData(
				timeSeriesData,
				dateRange.start_date,
				dateRange.end_date,
				{
					revenue: 0,
					transactions: 0,
					customers: 0,
					refund_amount: 0,
					refund_count: 0,
				}
			),
		[timeSeriesData, dateRange.start_date, dateRange.end_date]
	);

	const chartData = useMemo(
		() =>
			paddedTimeSeriesData.map((row) => ({
				date: row.date,
				revenue: row.revenue,
				transactions: row.transactions,
				avg_transaction:
					row.transactions > 0 ? row.revenue / row.transactions : 0,
				customers: row.customers,
				refunds: Math.abs(row.refund_amount ?? 0),
			})),
		[paddedTimeSeriesData]
	);

	const avgTransaction =
		overview && overview.total_transactions > 0
			? overview.total_revenue / overview.total_transactions
			: 0;

	return (
		<div className="relative flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Revenue</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					onClick={() => setSettingsOpen(true)}
					size="sm"
					variant="secondary"
				>
					<GearIcon className="size-4 shrink-0" weight="duotone" />
					Configure
				</Button>
			</TopBar.Actions>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				{hasError ? (
					<div className="flex min-h-full items-center justify-center p-4 py-16">
						<EmptyState
							action={{ label: "Retry", onClick: handleRetry }}
							description="We couldn't load revenue data. Try again in a moment."
							icon={<WarningCircleIcon />}
							title="Couldn't load revenue"
							variant="error"
						/>
					</div>
				) : isLoading || hasData ? (
					<div className="space-y-3 p-4 sm:space-y-4">
						<div className="grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-5">
							<StatCard
								displayMode="text"
								icon={CurrencyDollarIcon}
								id="total-revenue"
								isLoading={isLoading}
								title="Revenue"
								value={formatRevenueCurrency(
									overview?.total_revenue ?? 0,
									displayCurrency
								)}
							/>
							<StatCard
								displayMode="text"
								icon={ReceiptIcon}
								id="transactions"
								isLoading={isLoading}
								title="Transactions"
								value={overview?.total_transactions ?? 0}
							/>
							<StatCard
								displayMode="text"
								icon={CreditCardIcon}
								id="avg-transaction"
								isLoading={isLoading}
								title="Avg Transaction"
								value={formatRevenueCurrency(avgTransaction, displayCurrency)}
							/>
							<StatCard
								displayMode="text"
								icon={UsersIcon}
								id="unique-customers"
								isLoading={isLoading}
								title="Customers"
								value={overview?.unique_customers ?? 0}
							/>
							<StatCard
								description={
									overview?.attributed_transactions
										? `${overview.attributed_transactions} of ${overview.total_transactions} attributed`
										: undefined
								}
								displayMode="text"
								icon={TrendUpIcon}
								id="attribution-rate"
								isLoading={isLoading}
								title="Attribution"
								value={
									overview?.total_transactions
										? `${Math.round((overview.attributed_transactions / overview.total_transactions) * 100)}%`
										: "0%"
								}
							/>
						</div>

						{(isLoading || hasPaymentData) && (
							<div className="grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 lg:grid-cols-5">
								<StatCard
									description={paymentFailureObservationDescription(overview)}
									displayMode="text"
									icon={CreditCardIcon}
									id="payment-failure-rate"
									isLoading={isLoading}
									title="Payment failure rate"
									value={paymentFailureRateLabel(overview)}
								/>
								<StatCard
									description={
										overview?.top_payment_failure_reason
											? `Top cause: ${paymentFailureReasonLabel(overview.top_payment_failure_reason)}`
											: undefined
									}
									displayMode="text"
									icon={CreditCardIcon}
									id="failed-payments"
									isLoading={isLoading}
									title="Failed payments"
									value={overview?.failed_payment_attempts ?? 0}
								/>
								<StatCard
									displayMode="text"
									icon={ArrowClockwiseIcon}
									id="recovered-payments"
									isLoading={isLoading}
									title="Recovered payments"
									value={overview?.recovered_payment_attempts ?? 0}
								/>
								<StatCard
									description={
										overview?.top_payment_cancellation_reason
											? `Top reason: ${paymentFailureReasonLabel(overview.top_payment_cancellation_reason)}`
											: undefined
									}
									displayMode="text"
									icon={CreditCardIcon}
									id="canceled-payments"
									isLoading={isLoading}
									title="Canceled payments"
									value={overview?.canceled_payment_attempts ?? 0}
								/>
								<StatCard
									displayMode="text"
									icon={CurrencyDollarIcon}
									id="failed-payment-amount"
									isLoading={isLoading}
									title="Failed amount"
									value={formatRevenueCurrency(
										overview?.failed_payment_amount ?? 0,
										displayCurrency
									)}
								/>
							</div>
						)}

						<Card>
							<Card.Header className="flex-row items-center justify-between gap-3 py-3">
								<div className="min-w-0 flex-1">
									<Card.Title className="truncate text-sm">
										Revenue Trends
									</Card.Title>
									<Card.Description className="line-clamp-2 text-pretty">
										Revenue, transactions, customers, and refunds over time
									</Card.Description>
								</div>
							</Card.Header>
							<div className="overflow-x-auto">
								<RevenueChart
									currency={displayCurrency}
									data={chartData}
									height={isMobile ? 250 : 350}
									isLoading={isLoading}
									className="rounded-none border-0"
								/>
							</div>
						</Card>

						<RevenueAttributionTables
							currency={displayCurrency}
							dateRange={dateRange}
							enabled={revenueQueryEnabled}
							onAddFilter={handleAddFilter}
							queryFilters={revenueFilters}
							websiteId={websiteId}
						/>
					</div>
				) : (
					<div className="flex min-h-full items-center justify-center p-4 py-16">
						<EmptyState
							action={{
								label: hasInvalidCurrency
									? "Fix currency"
									: isConfigured
										? "Check webhook settings"
										: "Configure webhooks",
								onClick: () => setSettingsOpen(true),
							}}
							description={
								hasInvalidCurrency
									? "Choose the currency used to filter and format revenue reports."
									: isConfigured
										? "Revenue will appear here once your payment provider sends webhook events."
										: "Connect Stripe or Paddle to start tracking revenue and attribution."
							}
							icon={<CurrencyDollarIcon />}
							title={
								hasInvalidCurrency
									? "Choose a valid currency"
									: isConfigured
										? "Waiting for transactions"
										: "Set up revenue tracking"
							}
						/>
					</div>
				)}
			</div>

			<RevenueSettingsSheet
				onOpenChangeAction={setSettingsOpen}
				open={settingsOpen}
				websiteId={websiteId}
			/>
		</div>
	);
}

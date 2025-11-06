"use client";

import {
	ArrowClockwiseIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { StatCard } from "@/components/analytics/stat-card";
import { formatCurrency, formatNumber } from "@/lib/formatters";

interface RevenueMetricsProps {
	summary: {
		total_revenue: number;
		total_transactions: number;
		avg_order_value: number;
		total_refunds: number;
	};
	refundRate: number;
	isLoading: boolean;
}

export function RevenueMetrics({
	summary,
	refundRate,
	isLoading,
}: RevenueMetricsProps) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
			<StatCard
				className="h-full"
				icon={CurrencyDollarIcon}
				id="revenue-card"
				isLoading={isLoading}
				title="TOTAL REVENUE"
				value={formatCurrency(summary.total_revenue)}
				variant="success"
			/>
			<StatCard
				className="h-full"
				icon={CreditCardIcon}
				id="transactions-card"
				isLoading={isLoading}
				title="TRANSACTIONS"
				value={formatNumber(summary.total_transactions)}
				variant="info"
			/>
			<StatCard
				className="h-full"
				icon={TrendUpIcon}
				id="aov-card"
				isLoading={isLoading}
				title="AVERAGE ORDER VALUE"
				value={formatCurrency(summary.avg_order_value)}
				variant="default"
			/>
			<StatCard
				className="h-full"
				icon={ArrowClockwiseIcon}
				id="refund-rate-card"
				invertTrend={true}
				isLoading={isLoading}
				title="REFUND RATE"
				value={`${refundRate}%`}
				variant="warning"
			/>
		</div>
	);
}

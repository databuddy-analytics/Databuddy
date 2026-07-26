export interface RevenueOverview {
	attributed_revenue: number;
	attributed_transactions: number;
	canceled_payment_attempts: number | null;
	failed_payment_amount: number | null;
	failed_payment_attempts: number | null;
	observed_failure_event_types: number | null;
	payment_diagnostics_available: number;
	payment_failure_rate: number | null;
	recovered_payment_attempts: number | null;
	refund_amount: number;
	refund_count: number;
	required_failure_event_types: number | null;
	sale_count: number;
	sale_revenue: number;
	subscription_count: number;
	subscription_revenue: number;
	successful_payment_attempts: number | null;
	top_payment_cancellation_reason: string | null;
	top_payment_failure_reason: string | null;
	total_revenue: number;
	total_transactions: number;
	unique_customers: number;
}

function finiteNumber(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

export function hasRevenueActivity(
	overview: RevenueOverview | undefined
): boolean {
	return Boolean(
		overview &&
			(overview.total_transactions > 0 ||
				finiteNumber(overview.refund_count) > 0 ||
				finiteNumber(overview.failed_payment_attempts) > 0 ||
				finiteNumber(overview.canceled_payment_attempts) > 0)
	);
}

export function paymentFailureRateLabel(
	overview: RevenueOverview | undefined
): string {
	if (overview?.payment_diagnostics_available === 0) {
		return "—";
	}
	const measuredAttempts =
		finiteNumber(overview?.failed_payment_attempts) +
		finiteNumber(overview?.successful_payment_attempts);
	if (measuredAttempts === 0) {
		return "—";
	}
	return `${finiteNumber(overview?.payment_failure_rate)}%`;
}

export function paymentFailureObservationDescription(
	overview: RevenueOverview | undefined
): string {
	if (overview?.payment_diagnostics_available === 0) {
		return "Stripe payment diagnostics are unavailable for the selected filters.";
	}
	const observed = finiteNumber(overview?.observed_failure_event_types);
	if (observed === 0) {
		return "No recognized Stripe failure event types were observed in this range.";
	}
	return `${observed} distinct Stripe failure event ${observed === 1 ? "type was" : "types were"} observed in this range.`;
}

export function paymentFailureReasonLabel(
	reason: null | string | undefined
): string {
	return reason?.replaceAll("_", " ").replaceAll("-", " ") ?? "";
}

export function hasPaymentActivity(
	overview: RevenueOverview | undefined
): boolean {
	return Boolean(
		overview &&
			overview.payment_diagnostics_available !== 0 &&
			(finiteNumber(overview.successful_payment_attempts) > 0 ||
				finiteNumber(overview.failed_payment_attempts) > 0 ||
				finiteNumber(overview.canceled_payment_attempts) > 0)
	);
}

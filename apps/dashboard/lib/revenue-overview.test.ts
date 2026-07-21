import { describe, expect, it } from "bun:test";
import type { RevenueOverview } from "./revenue-overview";
import {
	hasPaymentActivity,
	hasRevenueActivity,
	paymentFailureObservationDescription,
	paymentFailureRateLabel,
	paymentFailureReasonLabel,
} from "./revenue-overview";

const emptyOverview = {
	attributed_revenue: 0,
	attributed_transactions: 0,
	canceled_payment_attempts: 0,
	failed_payment_amount: 0,
	failed_payment_attempts: 0,
	observed_failure_event_types: 0,
	payment_diagnostics_available: 1,
	payment_failure_rate: 0,
	recovered_payment_attempts: 0,
	required_failure_event_types: 2,
	refund_amount: 0,
	refund_count: 0,
	sale_count: 0,
	sale_revenue: 0,
	subscription_count: 0,
	subscription_revenue: 0,
	successful_payment_attempts: 0,
	total_revenue: 0,
	total_transactions: 0,
	top_payment_cancellation_reason: "",
	top_payment_failure_reason: "",
	unique_customers: 0,
} satisfies RevenueOverview;

describe("revenue overview activity", () => {
	it("shows a failure-only overview instead of the empty state", () => {
		const overview = {
			...emptyOverview,
			failed_payment_amount: 25,
			failed_payment_attempts: 1,
			payment_failure_rate: 100,
		};

		expect(hasRevenueActivity(overview)).toBe(true);
		expect(hasPaymentActivity(overview)).toBe(true);
	});

	it("shows a refund-only overview instead of the empty state", () => {
		const overview = {
			...emptyOverview,
			refund_amount: -25,
			refund_count: 1,
		};

		expect(hasRevenueActivity(overview)).toBe(true);
	});

	it("keeps a truly empty overview in the setup state", () => {
		expect(hasRevenueActivity(emptyOverview)).toBe(false);
		expect(hasPaymentActivity(emptyOverview)).toBe(false);
	});

	it("does not treat unavailable payment diagnostics as zero activity", () => {
		const overview = {
			...emptyOverview,
			canceled_payment_attempts: null,
			failed_payment_attempts: null,
			payment_diagnostics_available: 0,
			successful_payment_attempts: null,
		};

		expect(hasRevenueActivity(overview)).toBe(false);
		expect(hasPaymentActivity(overview)).toBe(false);
		expect(paymentFailureRateLabel(overview)).toBe("—");
		expect(paymentFailureObservationDescription(overview)).toBe(
			"Stripe payment diagnostics are unavailable for the selected filters."
		);
	});
});

describe("payment failure observations", () => {
	it("reports a tracked zero without inferring webhook coverage", () => {
		const overview = {
			...emptyOverview,
			successful_payment_attempts: 20,
		};

		expect(paymentFailureRateLabel(overview)).toBe("0%");
		expect(paymentFailureObservationDescription(overview)).toBe(
			"No recognized Stripe failure event types were observed in this range."
		);
	});

	it("describes observed event types as occurrences", () => {
		const overview = {
			...emptyOverview,
			failed_payment_attempts: 2,
			observed_failure_event_types: 1,
			payment_failure_rate: 10,
			successful_payment_attempts: 18,
		};

		expect(paymentFailureRateLabel(overview)).toBe("10%");
		expect(paymentFailureObservationDescription(overview)).toBe(
			"1 distinct Stripe failure event type was observed in this range."
		);
	});

	it("formats safe provider codes for display", () => {
		expect(paymentFailureReasonLabel("insufficient_funds")).toBe(
			"insufficient funds"
		);
		expect(paymentFailureReasonLabel(undefined)).toBe("");
	});
});

import { describe, expect, test } from "bun:test";
import {
	STRIPE_FAILURE_WEBHOOK_EVENTS,
	STRIPE_WEBHOOK_EVENTS,
} from "./stripe-webhooks";

describe("STRIPE_WEBHOOK_EVENTS", () => {
	test("keeps one unique canonical list with modern invoice allocations", () => {
		const names = [
			...STRIPE_WEBHOOK_EVENTS.required,
			...STRIPE_WEBHOOK_EVENTS.optional,
		].map(({ event }) => event);

		expect(new Set(names).size).toBe(names.length);
		expect(STRIPE_WEBHOOK_EVENTS.required.map(({ event }) => event)).toContain(
			"invoice_payment.paid"
		);
		expect(STRIPE_WEBHOOK_EVENTS.required.map(({ event }) => event)).toContain(
			"payment_intent.payment_failed"
		);
		expect(STRIPE_WEBHOOK_EVENTS.required.map(({ event }) => event)).toContain(
			"invoice.payment_failed"
		);
		expect(STRIPE_WEBHOOK_EVENTS.optional).toHaveLength(0);
		expect(
			STRIPE_FAILURE_WEBHOOK_EVENTS.map(({ event }) => event)
		).toEqual([
			"payment_intent.payment_failed",
			"invoice.payment_failed",
		]);
	});
});

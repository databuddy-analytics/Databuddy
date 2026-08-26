import { describe, expect, test } from "bun:test";
import {
	STRIPE_FAILURE_WEBHOOK_EVENTS,
	STRIPE_WEBHOOK_EVENTS,
} from "./stripe-webhooks";

describe("STRIPE_WEBHOOK_EVENTS", () => {
	const registeredEvents = [
		...STRIPE_WEBHOOK_EVENTS.required,
		...STRIPE_WEBHOOK_EVENTS.optional,
	].map(({ event }) => event);

	test("registers every event exactly once", () => {
		expect(new Set(registeredEvents).size).toBe(registeredEvents.length);
	});

	test("requires every failure event so payment failures are never missed", () => {
		const requiredEvents = STRIPE_WEBHOOK_EVENTS.required.map(
			({ event }) => event
		);

		expect(STRIPE_FAILURE_WEBHOOK_EVENTS.length).toBeGreaterThan(0);
		for (const { event } of STRIPE_FAILURE_WEBHOOK_EVENTS) {
			expect(requiredEvents).toContain(event);
		}
	});

	test("documents a purpose for every registered event", () => {
		for (const entry of [
			...STRIPE_WEBHOOK_EVENTS.required,
			...STRIPE_WEBHOOK_EVENTS.optional,
		]) {
			expect(entry.purpose.length).toBeGreaterThan(0);
		}
	});
});

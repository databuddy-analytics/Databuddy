import { describe, expect, test } from "vitest";
import {
	BASKET_SHUTDOWN_TIMEOUT_MS,
	PRODUCER_DRAIN_TIMEOUT_MS,
	SHUTDOWN_CLEANUP_HEADROOM_MS,
} from "./shutdown-budget";

describe("Basket shutdown budget", () => {
	test("reserves cleanup headroom after the producer drain deadline", () => {
		expect(BASKET_SHUTDOWN_TIMEOUT_MS).toBeGreaterThan(
			PRODUCER_DRAIN_TIMEOUT_MS
		);
		expect(SHUTDOWN_CLEANUP_HEADROOM_MS).toBeGreaterThanOrEqual(10_000);
	});
});

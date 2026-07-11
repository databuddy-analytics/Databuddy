import { describe, expect, it } from "bun:test";
import { summarizeTestDelivery } from "./notification-test-result";

describe("summarizeTestDelivery", () => {
	it("does not claim success when every destination fails", () => {
		expect(
			summarizeTestDelivery([
				{ channel: "email", success: false },
				{ channel: "slack", success: false },
			])
		).toMatchObject({
			kind: "error",
			title: "Test failed for Email, Slack",
		});
	});

	it("names partial delivery", () => {
		expect(
			summarizeTestDelivery([
				{ channel: "email", success: true },
				{ channel: "webhook", success: false },
			])
		).toMatchObject({
			kind: "warning",
			title: "Test delivered via Email",
			description:
				"Delivery failed for Webhook. Check those destinations and try again.",
		});
	});
});

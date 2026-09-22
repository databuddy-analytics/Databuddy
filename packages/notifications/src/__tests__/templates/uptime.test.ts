import { describe, expect, test } from "bun:test";
import {
	buildUptimeNotificationPayload,
	type UptimeNotificationInput,
} from "../../templates/uptime";

function makeInput(
	overrides: Partial<UptimeNotificationInput> = {}
): UptimeNotificationInput {
	return {
		kind: "down",
		siteLabel: "Acme Corp",
		url: "https://acme.com",
		checkedAt: 1_700_000_000_000,
		httpCode: 503,
		error: "Connection refused",
		...overrides,
	};
}

describe("buildUptimeNotificationPayload", () => {
	test("describes a missing HTTP response without exposing HTTP 0", () => {
		const result = buildUptimeNotificationPayload(makeInput({ httpCode: 0 }));
		expect(result.message).toContain("HTTP: No HTTP response");
		expect(result.message).not.toContain("HTTP: 0");
	});

	test("keeps the raw HTTP result in metadata for webhook routing", () => {
		const result = buildUptimeNotificationPayload(makeInput({ httpCode: 0 }));
		expect(result.metadata?.httpCode).toBe(0);
	});
});

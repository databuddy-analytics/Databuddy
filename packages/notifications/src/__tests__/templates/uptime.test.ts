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
	describe("title and priority", () => {
		test("down notification produces urgent priority", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "down" })
			);
			expect(result.title).toBe("Uptime: Acme Corp is down");
			expect(result.priority).toBe("urgent");
		});

		test("recovered notification produces normal priority", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "recovered" })
			);
			expect(result.title).toBe("Uptime: Acme Corp is back up");
			expect(result.priority).toBe("normal");
		});
	});

	describe("message content", () => {
		test("contains URL and checked time", () => {
			const result = buildUptimeNotificationPayload(makeInput());
			expect(result.message).toContain("URL: https://acme.com");
			expect(result.message).toContain("Checked at:");
		});

		test("contains HTTP code", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ httpCode: 503 })
			);
			expect(result.message).toContain("HTTP: 503");
		});

		test("includes response timing when provided", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ totalMs: 500, ttfbMs: 100 })
			);
			expect(result.message).toContain("TTFB 100 ms");
			expect(result.message).toContain("total 500 ms");
		});

		test("omits response line when timing undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ totalMs: undefined, ttfbMs: undefined })
			);
			expect(result.message).not.toContain("Response:");
		});

		test("includes probe region when provided", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ probeRegion: "us-east-1" })
			);
			expect(result.message).toContain("Region: us-east-1");
		});

		test("omits probe region when undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ probeRegion: undefined })
			);
			expect(result.message).not.toContain("Region:");
		});

		test("SSL valid with expiry", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ sslValid: true, sslExpiryMs: 1_800_000_000_000 })
			);
			expect(result.message).toContain("SSL: valid (expires");
		});

		test("SSL invalid without expiry", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ sslValid: false })
			);
			expect(result.message).toContain("SSL: invalid");
		});

		test("omits SSL line when undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ sslValid: undefined })
			);
			expect(result.message).not.toContain("SSL:");
		});

		test("includes error line on down", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "down", error: "Connection refused" })
			);
			expect(result.message).toContain("Error: Connection refused");
		});

		test("omits error line on recovered", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "recovered", error: "Connection refused" })
			);
			expect(result.message).not.toContain("Error:");
		});

		test("omits error line when error is empty", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "down", error: "" })
			);
			expect(result.message).not.toContain("Error:");
		});
	});

	describe("metadata", () => {
		test("contains required keys", () => {
			const result = buildUptimeNotificationPayload(makeInput());
			expect(result.metadata).toMatchObject({
				template: "uptime",
				kind: "down",
				siteLabel: "Acme Corp",
				url: "https://acme.com",
				checkedAt: 1_700_000_000_000,
				httpCode: 503,
			});
		});

		test("includes optional keys when present", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({
					probeRegion: "eu-west-1",
					totalMs: 200,
					ttfbMs: 50,
					sslValid: true,
					sslExpiryMs: 1_800_000_000_000,
				})
			);
			expect(result.metadata?.probeRegion).toBe("eu-west-1");
			expect(result.metadata?.totalMs).toBe(200);
			expect(result.metadata?.ttfbMs).toBe(50);
			expect(result.metadata?.sslValid).toBe(true);
			expect(result.metadata?.sslExpiryMs).toBe(1_800_000_000_000);
		});

		test("excludes optional keys when absent", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({
					probeRegion: undefined,
					totalMs: undefined,
					ttfbMs: undefined,
					sslValid: undefined,
				})
			);
			expect(result.metadata).not.toHaveProperty("probeRegion");
			expect(result.metadata).not.toHaveProperty("totalMs");
			expect(result.metadata).not.toHaveProperty("ttfbMs");
			expect(result.metadata).not.toHaveProperty("sslValid");
			expect(result.metadata).not.toHaveProperty("sslExpiryMs");
		});

		test("includes error in metadata when non-empty", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ error: "timeout" })
			);
			expect(result.metadata?.error).toBe("timeout");
		});

		test("excludes error from metadata when empty", () => {
			const result = buildUptimeNotificationPayload(makeInput({ error: "" }));
			expect(result.metadata).not.toHaveProperty("error");
		});
	});
});

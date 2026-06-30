import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifyPaddleSignature } from "./paddle";

const SECRET = "pdl_ntfset_test_secret_key";

function sign(payload: string, secret = SECRET, timestamp?: number): string {
	const ts = timestamp ?? Math.floor(Date.now() / 1000);
	const sig = createHmac("sha256", secret)
		.update(`${ts}:${payload}`, "utf8")
		.digest("hex");
	return `ts=${ts};h1=${sig}`;
}

const VALID_PAYLOAD = JSON.stringify({
	event_type: "transaction.completed",
	data: {
		id: "txn_1",
		created_at: "2026-01-01T00:00:00Z",
		billed_at: null,
		currency_code: "USD",
		details: { totals: { total: "1000" } },
	},
});

describe("verifyPaddleSignature", () => {
	test("valid Paddle Billing signature -> accepted", () => {
		const result = verifyPaddleSignature(VALID_PAYLOAD, sign(VALID_PAYLOAD), SECRET);
		expect(result.valid).toBe(true);
	});

	test("valid with multiple h1 signatures (one correct)", () => {
		const ts = Math.floor(Date.now() / 1000);
		const correct = createHmac("sha256", SECRET)
			.update(`${ts}:${VALID_PAYLOAD}`, "utf8")
			.digest("hex");
		const result = verifyPaddleSignature(
			VALID_PAYLOAD,
			`ts=${ts};h1=bad_signature;h1=${correct}`,
			SECRET
		);
		expect(result.valid).toBe(true);
	});

	test("raw-body-only legacy signature -> rejected", () => {
		const legacy = createHmac("sha256", SECRET)
			.update(VALID_PAYLOAD, "utf8")
			.digest("hex");
		const result = verifyPaddleSignature(VALID_PAYLOAD, legacy, SECRET);
		expect(result.valid).toBe(false);
	});

	test("wrong secret -> mismatch", () => {
		const result = verifyPaddleSignature(
			VALID_PAYLOAD,
			sign(VALID_PAYLOAD, "wrong_secret"),
			SECRET
		);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("mismatch");
		}
	});

	test("missing timestamp -> invalid", () => {
		const result = verifyPaddleSignature(VALID_PAYLOAD, "h1=abc", SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("timestamp");
		}
	});

	test("missing h1 -> invalid", () => {
		const ts = Math.floor(Date.now() / 1000);
		const result = verifyPaddleSignature(VALID_PAYLOAD, `ts=${ts}`, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("h1");
		}
	});

	test("timestamp outside tolerance -> rejected", () => {
		const oldTs = Math.floor(Date.now() / 1000) - 360;
		const result = verifyPaddleSignature(
			VALID_PAYLOAD,
			sign(VALID_PAYLOAD, SECRET, oldTs),
			SECRET
		);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("tolerance");
		}
	});
});

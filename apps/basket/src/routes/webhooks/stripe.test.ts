import { describe, expect, test } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe";

const SECRET = "whsec_test_secret_key";

function sign(payload: string, secret = SECRET, timestamp?: number): string {
	const ts = timestamp ?? Math.floor(Date.now() / 1000);
	const sig = createHmac("sha256", secret)
		.update(`${ts}.${payload}`, "utf8")
		.digest("hex");
	return `t=${ts},v1=${sig}`;
}

const VALID_PAYLOAD = JSON.stringify({
	id: "evt_1",
	type: "payment_intent.succeeded",
	data: {
		object: {
			id: "pi_1",
			amount: 1000,
			currency: "usd",
			created: 1_700_000_000,
		},
	},
});

describe("verifyStripeSignature", () => {
	// ── Valid signatures ──

	test("valid signature → parsed event", () => {
		const header = sign(VALID_PAYLOAD);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.event.id).toBe("evt_1");
			expect(result.event.type).toBe("payment_intent.succeeded");
		}
	});

	test("valid with multiple v1 signatures (one correct)", () => {
		const ts = Math.floor(Date.now() / 1000);
		const correctSig = createHmac("sha256", SECRET)
			.update(`${ts}.${VALID_PAYLOAD}`, "utf8")
			.digest("hex");
		const header = `t=${ts},v1=wrong_sig,v1=${correctSig}`;
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Missing fields ──

	test("missing timestamp → invalid", () => {
		const result = verifyStripeSignature(VALID_PAYLOAD, "v1=abc123", SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("timestamp");
		}
	});

	test("missing v1 signature → invalid", () => {
		const ts = Math.floor(Date.now() / 1000);
		const result = verifyStripeSignature(VALID_PAYLOAD, `t=${ts}`, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("No v1");
		}
	});

	// ── Signature mismatch ──

	test("wrong secret → mismatch", () => {
		const header = sign(VALID_PAYLOAD, "wrong_secret");
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("mismatch");
		}
	});

	test("tampered payload → mismatch", () => {
		const header = sign(VALID_PAYLOAD);
		const tampered = VALID_PAYLOAD.replace("1000", "999999");
		const result = verifyStripeSignature(tampered, header, SECRET);
		expect(result.valid).toBe(false);
	});

	test("tampered signature → mismatch", () => {
		const header = sign(VALID_PAYLOAD);
		const tampered = header.replace(/v1=([a-f0-9]{10})/, "v1=0000000000");
		const result = verifyStripeSignature(VALID_PAYLOAD, tampered, SECRET);
		expect(result.valid).toBe(false);
	});

	// ── Timestamp tolerance ──

	test("timestamp 6 minutes old → rejected", () => {
		const oldTs = Math.floor(Date.now() / 1000) - 360;
		const header = sign(VALID_PAYLOAD, SECRET, oldTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("tolerance");
		}
	});

	test("timestamp 4 minutes old → accepted", () => {
		const recentTs = Math.floor(Date.now() / 1000) - 240;
		const header = sign(VALID_PAYLOAD, SECRET, recentTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	test("future timestamp within tolerance → accepted", () => {
		const futureTs = Math.floor(Date.now() / 1000) + 60;
		const header = sign(VALID_PAYLOAD, SECRET, futureTs);
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Invalid JSON ──

	test("valid signature but invalid JSON body → error", () => {
		const broken = "not json {{{";
		const header = sign(broken);
		const result = verifyStripeSignature(broken, header, SECRET);
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("JSON");
		}
	});

	// ���─ Edge cases ──

	test("empty payload", () => {
		const header = sign("");
		const result = verifyStripeSignature("", header, SECRET);
		// Empty string is not valid JSON, so should fail at parse step
		expect(result.valid).toBe(false);
	});

	test("empty header → missing timestamp", () => {
		const result = verifyStripeSignature(VALID_PAYLOAD, "", SECRET);
		expect(result.valid).toBe(false);
	});

	test("header with extra unknown parts → still works", () => {
		const ts = Math.floor(Date.now() / 1000);
		const sig = createHmac("sha256", SECRET)
			.update(`${ts}.${VALID_PAYLOAD}`, "utf8")
			.digest("hex");
		const header = `t=${ts},v1=${sig},v0=legacy`;
		const result = verifyStripeSignature(VALID_PAYLOAD, header, SECRET);
		expect(result.valid).toBe(true);
	});

	// ── Fuzz: 50 random payloads with correct signatures ──

	test("50 random payloads → all verify correctly", () => {
		for (let i = 0; i < 50; i++) {
			const payload = JSON.stringify({
				id: `evt_${i}`,
				type: "charge.succeeded",
				data: { object: { id: `ch_${i}`, amount: i * 100 } },
			});
			const header = sign(payload);
			const result = verifyStripeSignature(payload, header, SECRET);
			expect(result.valid).toBe(true);
		}
	});

	// ── Fuzz: 50 random payloads with wrong signatures ──

	test("50 random payloads with wrong secret → all rejected", () => {
		for (let i = 0; i < 50; i++) {
			const payload = JSON.stringify({
				id: `evt_${i}`,
				type: "x",
				data: { object: {} },
			});
			const header = sign(payload, "wrong_secret_" + i);
			const result = verifyStripeSignature(payload, header, SECRET);
			expect(result.valid).toBe(false);
		}
	});
});

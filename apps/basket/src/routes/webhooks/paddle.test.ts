import { createHmac } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
const { mockInsert } = vi.hoisted(() => ({
	mockInsert: vi.fn(() => Promise.resolve()),
}));

vi.mock("@databuddy/db/clickhouse", () => ({
	clickHouse: { insert: mockInsert },
}));
vi.mock("@lib/security", () => ({
	getDailySalt: vi.fn(() => Promise.resolve("test-salt")),
	saltAnonymousId: vi.fn((id: string) => `salted_${id}`),
}));
vi.mock("./shared", () => ({
	formatDate: (date: Date) => date.toISOString().slice(0, 19).replace("T", " "),
	getWebhookConfig: vi.fn(() =>
		Promise.resolve({
			ownerId: "org_example",
			websiteId: "website_example",
			paddleWebhookSecret: "pdl_ntfset_test_secret_key",
		})
	),
	resolveWebsiteId: vi.fn(() => Promise.resolve("website_example")),
	recordWebhookDelivery: vi.fn(() => Promise.resolve()),
}));
vi.mock("evlog/elysia", async () => {
	const { Elysia } = await import("elysia");
	return {
		evlog: () => new Elysia(),
		useLogger: () => ({ set: vi.fn(), warn: vi.fn(), error: vi.fn() }),
	};
});

import { paddleWebhook, verifyPaddleSignature } from "./paddle";

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
		const result = verifyPaddleSignature(
			VALID_PAYLOAD,
			sign(VALID_PAYLOAD),
			SECRET
		);
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

test("preserves customer and subscription identity from completed webhooks", async () => {
	mockInsert.mockClear();
	const payload = JSON.stringify({
		event_id: "evt_example",
		event_type: "transaction.completed",
		data: {
			id: "txn_example",
			customer_id: "ctm_example",
			subscription_id: "sub_example",
			created_at: "2026-01-01T00:00:00Z",
			billed_at: null,
			currency_code: "USD",
			details: {
				totals: { total: "1000" },
				line_items: [
					{
						price_id: "pri_example",
						product: { id: "pro_example", name: "Example" },
					},
				],
			},
		},
	});
	const response = await paddleWebhook.handle(
		new Request("http://localhost/webhooks/paddle/example", {
			method: "POST",
			headers: { "paddle-signature": sign(payload) },
			body: payload,
		})
	);
	expect(response.status).toBe(200);
	expect(mockInsert).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			table: "analytics.revenue",
			values: [
				expect.objectContaining({
					owner_id: "org_example",
					website_id: "website_example",
					transaction_id: "txn_example",
					customer_id: "ctm_example",
					type: "subscription",
					amount: 10,
				}),
			],
		})
	);
});

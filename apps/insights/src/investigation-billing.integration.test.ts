import "@databuddy/test/env";
import { afterAll, describe, expect, it, spyOn } from "bun:test";
import * as execution from "@databuddy/ai/agents/execution";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import { analyticsInsights, insightObservations, investigationCharges, organization, websites } from "@databuddy/db/schema";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { randomUUIDv7 } from "bun";
import {
	canRunInvestigation, commitInvestigationCharge, createInvestigationBillingClient,
	reserveInvestigationCharge, resolveInvestigationBilling, settleInvestigationCharge,
	releaseInvestigationCharge,
	recoverInvestigationCharges,
} from "./investigation-billing";
import { prepareInvestigation } from "./investigation";

const integration = process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const ids: string[] = [];
const customerId = "synthetic-investigation-customer";
const balance = {
	feature_id: INVESTIGATION_USAGE.featureId, granted: 1, remaining: 0, usage: 1,
	unlimited: false, overage_allowed: false, max_purchase: null, next_reset_at: null,
};

function provider(input: { balance?: boolean; units?: number; status?: number } = {}) {
	const requests: { key: string | null; body: Record<string, unknown>; url: string }[] = [];
	const seen = new Set<string>();
	let units = input.units ?? 1;
	let status = input.status ?? 200;
	const client = createInvestigationBillingClient({
		secretKey: "synthetic-local-only",
		fetcher: async (request) => {
			if (!(request instanceof Request)) throw new Error("Expected a native SDK request");
			expect(new URL(request.url).hostname).toBe("api.useautumn.com");
			const body = request.method === "GET" ? {} : await request.json() as Record<string, unknown>;
			const key = request.headers.get("Idempotency-Key");
			requests.push({ key, body, url: request.url });
			if (status !== 200) return Response.json(status === 202 ? { allowed: true, success: true, customer_id: null, balance: null, flag: null } : { message: "synthetic transport failure" }, { status });
			if (request.url.includes("customers.get")) return Response.json({
				id: customerId, name: null, email: null, created_at: 0, fingerprint: null, stripe_id: null,
				env: "sandbox", metadata: {}, send_email_receipts: false, billing_controls: {},
				subscriptions: [], purchases: [], balances: input.balance === false ? {} : { [INVESTIGATION_USAGE.featureId]: balance }, flags: {},
			});
			if (key && seen.has(key)) return Response.json({ message: "duplicate idempotency key" }, { status: 409 });
			if (key) seen.add(key);
			if (request.url.includes("balances.check")) {
				const allowed = units > 0;
				if (body.send_event && allowed) units -= 1;
				return Response.json({ allowed, customer_id: customerId, balance, flag: null });
			}
			if (request.url.includes("balances.finalize")) return Response.json({ success: true });
			throw new Error("Unexpected SDK endpoint");
		},
	});
	return { client, requests, setStatus: (value: number) => { status = value; } };
}

async function fixture() {
	const organizationId = randomUUIDv7();
	const websiteId = randomUUIDv7();
	const insightId = randomUUIDv7();
	ids.push(organizationId);
	await db.insert(organization).values({ id: organizationId, name: "Synthetic investigation", slug: organizationId, createdAt: new Date() });
	await db.insert(websites).values({ id: websiteId, organizationId, domain: "billing.example.invalid" });
	await db.insert(analyticsInsights).values({ id: insightId, organizationId, websiteId, title: "Verified steady result", description: "20 completed checkouts", subjectKey: "checkout", severity: "info", sentiment: "neutral", status: "resolved" });
	return { organizationId, websiteId, insightId, operationKey: JSON.stringify(["run", randomUUIDv7(), websiteId, "checkout"]), billing: { mode: "fixed" as const, customerId } };
}

async function saveAnswer(input: Awaited<ReturnType<typeof fixture>>, chargeId: string, complete = true, readable = true, rollback = false) {
	return db.transaction(async (tx) => {
		const observationId = randomUUIDv7();
		await tx.insert(insightObservations).values({
			id: observationId, organizationId: input.organizationId, websiteId: input.websiteId,
			insightId: readable ? input.insightId : null, signalKey: "checkout", asOf: new Date(), recheckAt: new Date(),
			signal: prepareInvestigation({ baseline: 20, current: 20, deltaPercent: 0, detectedAt: "2026-09-01", direction: "up", label: "Checkout", method: "wow", metric: "checkout", severity: "info" }, 7).signal,
			outcome: { title: "Verified steady result", summary: "20 completed checkouts, unchanged.", evidence: ["20 completed checkouts in both periods"], rootCause: null, impact: null, publish: false, next: { type: "resolve", reason: "No action required" } },
		});
		await commitInvestigationCharge(tx, { chargeId, observationId, complete });
		if (rollback) throw new Error("Synthetic transaction rollback");
		return observationId;
	});
}

async function chargeState(id: string) {
	const [row] = await db.select().from(investigationCharges).where(eq(investigationCharges.id, id));
	return row;
}

integration("fixed investigation billing at the PostgreSQL and native Autumn boundaries", () => {
	afterAll(async () => {
		if (ids.length) await db.delete(organization).where(inArray(organization.id, ids));
		await shutdownPostgres();
	});

	it("selects fixed terms at zero balance and preserves absent-feature legacy terms; errors never choose free", async () => {
		const original = process.env.AUTUMN_SECRET_KEY;
		process.env.AUTUMN_SECRET_KEY = "synthetic-local-only";
		const customer = spyOn(execution, "resolveAgentBillingCustomerId").mockResolvedValue(customerId);
		try {
			expect(await resolveInvestigationBilling({ organizationId: "synthetic-org" }, provider().client)).toEqual({ mode: "fixed", customerId });
			expect(await resolveInvestigationBilling({ organizationId: "synthetic-org" }, provider({ balance: false }).client)).toEqual({ mode: "legacy", customerId });
			await expect(resolveInvestigationBilling({ organizationId: "synthetic-org" }, provider({ status: 500 }).client)).rejects.toThrow();
			customer.mockResolvedValue(null);
			await expect(resolveInvestigationBilling({ organizationId: "synthetic-org" }, provider().client)).rejects.toThrow("customer is unavailable");
		} finally {
			customer.mockRestore();
			if (original === undefined) delete process.env.AUTUMN_SECRET_KEY;
			else process.env.AUTUMN_SECRET_KEY = original;
		}
	});

	it("rejects SDK fail-open responses and malformed identities before access", async () => {
		for (const status of [202, 500]) {
			await expect(canRunInvestigation({ mode: "fixed", customerId }, provider({ status }).client)).rejects.toThrow();
		}
		expect(await canRunInvestigation({ mode: "fixed", customerId }, provider({ units: 0 }).client)).toBe(false);
	});

	it("reserves one unit across concurrent duplicate workers and retries, then confirms a readable unpublished answer once", async () => {
		const input = await fixture();
		const remote = provider();
		const attempts = await Promise.allSettled([reserveInvestigationCharge(input, remote.client), reserveInvestigationCharge(input, remote.client)]);
		const first = attempts.find((result) => result.status === "fulfilled");
		if (first?.status !== "fulfilled") throw new Error("No reservation succeeded");
		const charge = first.value;
		expect((await reserveInvestigationCharge(input, remote.client)).id).toBe(charge.id);
		expect(remote.requests.filter((request) => request.url.includes("balances.check"))).toHaveLength(1);
		expect(remote.requests[0]?.body.required_balance).toBe(1);
		expect(remote.requests[0]?.body.send_event).toBe(true);
		expect(charge.priceCents).toBe(100);
		await saveAnswer(input, charge.id);
		expect((await chargeState(charge.id))?.status).toBe("confirm_pending");
		await settleInvestigationCharge(charge.id, remote.client);
		await settleInvestigationCharge(charge.id, remote.client);
		expect(remote.requests.filter((request) => request.body.action === "confirm")).toHaveLength(1);
		expect((await chargeState(charge.id))?.status).toBe("confirmed");
	});

	it("binds the accepted 100-cent quote durably and refuses a different quote on retry", async () => {
		const input = { ...(await fixture()), expectedPriceCents: 100 };
		const remote = provider();
		const charge = await reserveInvestigationCharge(input, remote.client);
		expect((await chargeState(charge.id))?.priceCents).toBe(100);
		expect((await reserveInvestigationCharge(input, remote.client)).id).toBe(
			charge.id
		);
		await expect(
			reserveInvestigationCharge(
				{ ...input, expectedPriceCents: 200 },
				remote.client
			)
		).rejects.toThrow("does not match this reservation");
		expect((await chargeState(charge.id))?.priceCents).toBe(100);
		expect(remote.requests).toHaveLength(1);
	});

	it.each([
		0, -100, 100.5, 200,
	])("does not create a new charge or call the provider for an unavailable quote of %s cents", async (expectedPriceCents) => {
		const input = await fixture();
		const remote = provider();
		await expect(
			reserveInvestigationCharge({ ...input, expectedPriceCents }, remote.client)
		).rejects.toThrow("accepted investigation price");
		expect(remote.requests).toHaveLength(0);
		expect(
			await db
				.select()
				.from(investigationCharges)
				.where(eq(investigationCharges.organizationId, input.organizationId))
		).toHaveLength(0);
	});

	it.each([
		"pending",
		"reserved",
	] as const)("preserves a prior quote only after an acknowledged hold: %s", async (status) => {
		const input = await fixture();
		const remote = provider();
		const id = randomUUIDv7();
		await db.insert(investigationCharges).values({
			id,
			organizationId: input.organizationId,
			websiteId: input.websiteId,
			operationKey: input.operationKey,
			customerId,
			mode: "fixed",
			featureId: INVESTIGATION_USAGE.featureId,
			priceCents: 200,
			status,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const retry = reserveInvestigationCharge(
			{ ...input, expectedPriceCents: 200 },
			remote.client
		);
		if (status === "reserved") {
			expect(await retry).toMatchObject({ id, priceCents: 200, status });
		} else {
			await expect(retry).rejects.toThrow("no longer available");
		}
		await expect(
			reserveInvestigationCharge(
				{ ...input, expectedPriceCents: 100 },
				remote.client
			)
		).rejects.toThrow("does not match this reservation");
		expect((await chargeState(id))?.priceCents).toBe(200);
		expect(remote.requests).toHaveLength(0);
	});

	it("does not confirm invisible answers or rolled-back observations; an incomplete result releases the hold", async () => {
		const input = await fixture();
		const remote = provider();
		const charge = await reserveInvestigationCharge(input, remote.client);
		await expect(saveAnswer(input, charge.id, true, false)).rejects.toThrow("readable");
		await expect(saveAnswer(input, charge.id, true, true, true)).rejects.toThrow("rollback");
		expect((await chargeState(charge.id))?.status).toBe("reserved");
		expect((await chargeState(charge.id))?.observationId).toBeNull();
		await saveAnswer(input, charge.id, false, false);
		await settleInvestigationCharge(charge.id, remote.client);
		expect(remote.requests.at(-1)?.body.action).toBe("release");
		expect((await chargeState(charge.id))?.status).toBe("released");
	});

	it("retains confirmation uncertainty after commit and never creates a late debit outside the lock window", async () => {
		const input = await fixture();
		const remote = provider();
		const charge = await reserveInvestigationCharge(input, remote.client);
		await saveAnswer(input, charge.id);
		remote.setStatus(202);
		await expect(settleInvestigationCharge(charge.id, remote.client)).rejects.toThrow();
		expect((await chargeState(charge.id))?.status).toBe("confirm_pending");
		await expect(releaseInvestigationCharge(charge.id, remote.client)).rejects.toThrow();
		expect(remote.requests.some((request) => request.body.action === "release")).toBe(false);
		await db.update(investigationCharges).set({ expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(investigationCharges.id, charge.id));
		const before = remote.requests.length;
		await settleInvestigationCharge(charge.id, remote.client);
		expect(remote.requests).toHaveLength(before);
		expect((await chargeState(charge.id))?.status).toBe("review_required");
		await expect(reserveInvestigationCharge(input, remote.client)).rejects.toThrow("no new charge");
	});

	it("aborts uncertain reservations without running work or silently retrying a second charge", async () => {
		const input = await fixture();
		const remote = provider({ status: 202 });
		await expect(reserveInvestigationCharge(input, remote.client)).rejects.toThrow();
		await expect(reserveInvestigationCharge(input, remote.client)).rejects.toThrow("no new charge");
		expect(remote.requests).toHaveLength(1);
		const [charge] = await db.select().from(investigationCharges).where(eq(investigationCharges.operationKey, input.operationKey));
		if (!charge) throw new Error("Missing charge");
		expect(charge.status).toBe("release_pending");
		remote.setStatus(200);
		await settleInvestigationCharge(charge.id, remote.client);
		expect(remote.requests.at(-1)?.body.action).toBe("release");
	});

	it("protects the last unit across distinct investigations and freezes grandfathered terms", async () => {
		const input = await fixture();
		const remote = provider();
		const second = { ...input, operationKey: JSON.stringify(["reply", randomUUIDv7()]) };
		const results = await Promise.allSettled([reserveInvestigationCharge(input, remote.client), reserveInvestigationCharge(second, remote.client)]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		const legacy = await reserveInvestigationCharge({ ...input, operationKey: "legacy-operation", billing: { mode: "legacy", customerId } }, remote.client);
		expect((await reserveInvestigationCharge({ ...input, operationKey: "legacy-operation" }, remote.client)).mode).toBe("legacy");
		expect(legacy.priceCents).toBe(0);
		expect(remote.requests.filter((request) => request.url.includes("balances.check"))).toHaveLength(2);
	});

	it("keeps a lost confirmation receipt unresolved when Autumn returns a duplicate 409", async () => {
		const input = await fixture();
		const remote = provider();
		const charge = await reserveInvestigationCharge(input, remote.client);
		await saveAnswer(input, charge.id);
		await settleInvestigationCharge(charge.id, remote.client);
		// Crash after the provider committed, before saving its receipt locally.
		await db.update(investigationCharges).set({ status: "confirm_pending" }).where(eq(investigationCharges.id, charge.id));
		await expect(settleInvestigationCharge(charge.id, remote.client)).rejects.toThrow();
		expect((await chargeState(charge.id))?.status).toBe("confirm_pending");
		const confirmations = remote.requests.filter((request) => request.body.action === "confirm");
		expect(confirmations).toHaveLength(2);
		expect(new Set(confirmations.map((request) => request.key)).size).toBe(1);
	});

	it("recovers committed work without another reservation and retires never-started orphan intents", async () => {
		const input = { ...await fixture(), runId: randomUUIDv7() };
		const remote = provider();
		const charge = await reserveInvestigationCharge(input, remote.client);
		await saveAnswer(input, charge.id);
		await recoverInvestigationCharges(input, remote.client);
		expect((await chargeState(charge.id))?.status).toBe("confirmed");
		expect(remote.requests.filter((request) => request.url.includes("balances.check"))).toHaveLength(1);
		await db.update(investigationCharges).set({ status: "pending", observationId: null, leaseUntil: null, createdAt: new Date(Date.now() - 120_000) }).where(eq(investigationCharges.id, charge.id));
		const before = remote.requests.length;
		await recoverInvestigationCharges(input, remote.client);
		expect((await chargeState(charge.id))?.status).toBe("released");
		expect(remote.requests).toHaveLength(before);
	});
});

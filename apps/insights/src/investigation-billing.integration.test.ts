import { afterEach, describe, expect, it, mock } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";

// The provider contract is exercised through the installed SDK. Customer ownership
// is the only application dependency stubbed; no PostgreSQL or Redis is needed.
const resolveCustomer = mock(async (): Promise<string | null> => customerId);
mock.module("@databuddy/ai/agents/execution", () => ({
	resolveAgentBillingCustomerId: resolveCustomer,
}));
const {
	assertInvestigationReservationActive,
	canRunInvestigation,
	createInvestigationBillingClient,
	releaseInvestigationCharge,
	reserveInvestigationCharge,
	resolveInvestigationBilling,
	settleInvestigationCharge,
} = await import("./investigation-billing");

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const customerId = "synthetic-investigation-customer";
const originalSecret = process.env.AUTUMN_SECRET_KEY;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	if (originalSecret === undefined) {
		delete process.env.AUTUMN_SECRET_KEY;
	} else {
		process.env.AUTUMN_SECRET_KEY = originalSecret;
	}
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
	resolveCustomer.mockResolvedValue(customerId);
	resolveCustomer.mockClear();
});

interface NativePrice {
	amount?: number;
	billing_method?: string;
	billing_units?: number;
	max_purchase?: number | null;
	tier_behavior?: string;
	tiers?: { to: number | "inf"; amount: number }[];
}
interface Fault {
	afterCommit?: boolean;
	body?: unknown;
	endpoint: "reserve" | "finalize" | "customer";
	lost?: boolean;
	status?: number;
}

function provider(
	options: {
		grant?: number;
		remaining?: number;
		overage?: boolean;
		entitled?: boolean;
		responseCustomerId?: string;
		responseFeatureId?: string;
		breakdown?: boolean;
		price?: NativePrice | null;
	} = {}
) {
	const requests: {
		endpoint: string;
		key: string | null;
		body: Record<string, unknown>;
	}[] = [];
	const holds = new Map<string, number>();
	const idempotencyKeys = new Set<string>();
	const faults: Fault[] = [];
	const grant = options.grant ?? 1;
	let remaining = options.remaining ?? grant;
	let confirmed = 0;
	let released = 0;
	const nativePrice =
		options.price === undefined
			? {
					amount: 1,
					billing_units: 1,
					billing_method: "usage_based",
					max_purchase: null,
				}
			: options.price;
	const balance = () => ({
		feature_id: options.responseFeatureId ?? INVESTIGATION_USAGE.featureId,
		granted: grant,
		remaining,
		usage: grant - remaining,
		unlimited: false,
		overage_allowed: options.overage === true,
		max_purchase: null,
		next_reset_at: options.overage ? Date.UTC(2026, 9, 1) : null,
		breakdown:
			options.breakdown === false
				? undefined
				: [
						{
							id: "synthetic-grant",
							plan_id: "synthetic-plan",
							included_grant: grant,
							prepaid_grant: 0,
							remaining,
							usage: grant - remaining,
							unlimited: false,
							reset: options.overage
								? { interval: "month", resets_at: Date.UTC(2026, 9, 1) }
								: null,
							expires_at: null,
							price: options.overage ? nativePrice : null,
						},
					],
	});
	const faultResponse = (fault: Fault) => {
		if (fault.lost) {
			throw new TypeError("Synthetic response lost after provider processing");
		}
		return Response.json(
			fault.body ?? {
				code: "synthetic_error",
				message: "Synthetic provider failure",
			},
			{ status: fault.status ?? 500 }
		);
	};
	const client = createInvestigationBillingClient({
		secretKey: "synthetic-local-only",
		fetcher: async (request) => {
			if (!(request instanceof Request)) {
				throw new Error("Expected a native SDK request");
			}
			expect(new URL(request.url).hostname).toBe("api.useautumn.com");
			const body =
				request.method === "GET"
					? {}
					: ((await request.json()) as Record<string, unknown>);
			const endpoint = request.url.includes("customers.get")
				? "customer"
				: request.url.includes("balances.finalize")
					? "finalize"
					: request.url.includes("balances.check")
						? "reserve"
						: "unexpected";
			const key = request.headers.get("Idempotency-Key");
			requests.push({ endpoint, key, body });
			const index = faults.findIndex((fault) => fault.endpoint === endpoint);
			const fault = index >= 0 ? faults.splice(index, 1)[0] : undefined;
			if (fault && !fault.afterCommit) {
				return faultResponse(fault);
			}
			if (endpoint === "customer") {
				return Response.json({
					id: options.responseCustomerId ?? customerId,
					name: null,
					email: null,
					created_at: 0,
					fingerprint: null,
					stripe_id: null,
					env: "sandbox",
					metadata: {},
					send_email_receipts: false,
					billing_controls: {},
					subscriptions: [],
					purchases: [],
					flags: {},
					balances:
						options.entitled === false
							? {}
							: { [INVESTIGATION_USAGE.featureId]: balance() },
				});
			}
			if (endpoint === "reserve") {
				if (key && idempotencyKeys.has(key)) {
					return Response.json(
						{
							code: "duplicate_idempotency_key",
							message: "Duplicate idempotency key",
						},
						{ status: 409 }
					);
				}
				if (key) {
					idempotencyKeys.add(key);
				}
				const allowed =
					remaining >= Number(body.required_balance ?? 1) ||
					options.overage === true;
				if (body.send_event && allowed) {
					const lock = body.lock as {
						enabled: boolean;
						lock_id: string;
						expires_at: number;
					};
					expect(lock.enabled).toBe(true);
					expect(holds.has(lock.lock_id)).toBe(false);
					remaining -= 1;
					holds.set(lock.lock_id, lock.expires_at);
				}
				if (fault) {
					return faultResponse(fault);
				}
				return Response.json({
					allowed,
					customer_id: options.responseCustomerId ?? customerId,
					balance: balance(),
					flag: null,
				});
			}
			if (endpoint === "finalize") {
				const id = String(body.lock_id);
				if (!holds.has(id)) {
					return Response.json(
						{
							code: "invalid_request",
							message: `Lock not found for ID: ${id}`,
						},
						{ status: 400 }
					);
				}
				holds.delete(id);
				if (body.action === "release") {
					remaining += 1;
					released += 1;
				} else {
					expect(body.action).toBe("confirm");
					confirmed += 1;
				}
				if (fault) {
					return faultResponse(fault);
				}
				return Response.json({ success: true });
			}
			throw new Error("Unexpected native SDK endpoint");
		},
	});
	return {
		client,
		requests,
		faults,
		state: () => ({ remaining, confirmed, released, holds: holds.size }),
	};
}

function operation(operationKey = "run:synthetic-run:synthetic-site:checkout") {
	return {
		organizationId: "synthetic-org",
		websiteId: "synthetic-site",
		operationKey,
		startedAt: new Date(),
		billing: { mode: "fixed" as const, customerId },
	};
}

integration("investigation billing through the native Autumn SDK", () => {
	it("selects fixed terms even at zero balance; absent feature stays legacy and failures never become free", async () => {
		const fixed = provider({ remaining: 0 });
		expect(
			await resolveInvestigationBilling(
				{ organizationId: "synthetic-org" },
				fixed.client
			)
		).toEqual({ mode: "fixed", customerId });
		expect(
			await canRunInvestigation({ mode: "fixed", customerId }, fixed.client)
		).toBe(false);
		expect(
			await resolveInvestigationBilling(
				{ organizationId: "synthetic-org" },
				provider({ entitled: false }).client
			)
		).toEqual({ mode: "fixed", customerId });
		const failed = provider();
		failed.faults.push({ endpoint: "customer", status: 500 });
		await expect(
			resolveInvestigationBilling(
				{ organizationId: "synthetic-org" },
				failed.client
			)
		).rejects.toThrow();
		resolveCustomer.mockResolvedValue(null);
		await expect(
			resolveInvestigationBilling(
				{ organizationId: "synthetic-org" },
				fixed.client
			)
		).rejects.toThrow("customer is unavailable");
	});

	it("rejects missing production configuration and mismatched native customer identities", async () => {
		delete process.env.AUTUMN_SECRET_KEY;
		process.env.NODE_ENV = "production";
		expect(() => createInvestigationBillingClient()).toThrow("not configured");
		await expect(
			resolveInvestigationBilling({ organizationId: "synthetic-org" })
		).rejects.toThrow("not configured");
		const remote = provider({ responseCustomerId: "different-customer" });
		await expect(
			resolveInvestigationBilling(
				{ organizationId: "synthetic-org" },
				remote.client
			)
		).rejects.toThrow("could not be verified");
		await expect(
			canRunInvestigation({ mode: "fixed", customerId }, remote.client)
		).rejects.toThrow("could not be verified");
		await expect(
			reserveInvestigationCharge(operation(), remote.client)
		).rejects.toThrow("could not be verified");
		expect(remote.state().confirmed).toBe(0);
	});

	it("authorizes only one concurrent duplicate worker and keeps the immutable reservation identity and expiry on retry", async () => {
		const remote = provider();
		const input = operation();
		const results = await Promise.allSettled([
			reserveInvestigationCharge(input, remote.client),
			reserveInvestigationCharge(input, remote.client),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected")
		).toHaveLength(1);
		await expect(
			reserveInvestigationCharge(input, remote.client)
		).rejects.toThrow();
		const reserves = remote.requests.filter(
			(request) => request.endpoint === "reserve"
		);
		expect(new Set(reserves.map((request) => request.key)).size).toBe(1);
		expect(
			new Set(reserves.map((request) => JSON.stringify(request.body))).size
		).toBe(1);
		expect(reserves[0]?.body).toMatchObject({
			customer_id: customerId,
			feature_id: INVESTIGATION_USAGE.featureId,
			required_balance: 1,
			send_event: true,
			lock: {
				enabled: true,
				expires_at: input.startedAt.getTime() + 23 * 60 * 60 * 1000,
			},
		});
		expect(remote.state()).toEqual({
			remaining: 0,
			confirmed: 0,
			released: 0,
			holds: 1,
		});
	});

	it("protects the last included unit across distinct operations and separates site, organization, and signal identities", async () => {
		const capped = provider();
		const attempts = await Promise.allSettled([
			reserveInvestigationCharge(operation("first-question"), capped.client),
			reserveInvestigationCharge(operation("second-question"), capped.client),
		]);
		expect(
			attempts.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		expect(capped.state().holds).toBe(1);
		const remote = provider({ grant: 4 });
		const input = operation();
		const reservations = await Promise.all(
			[
				input,
				{ ...input, operationKey: "different-signal" },
				{ ...input, websiteId: "different-site" },
				{ ...input, organizationId: "different-org" },
			].map((value) => reserveInvestigationCharge(value, remote.client))
		);
		expect(
			new Set(reservations.map((reservation) => reservation.id)).size
		).toBe(4);
		expect(remote.state().remaining).toBe(0);
	});

	it.each([
		["complete", true],
		["incomplete", false],
	] as const)("finalizes %s without a second debit and treats deleted locks as no-op, not a receipt", async (_label, complete) => {
		const remote = provider();
		const input = operation();
		await reserveInvestigationCharge(input, remote.client);
		await settleInvestigationCharge({ ...input, complete }, remote.client);
		await settleInvestigationCharge({ ...input, complete }, remote.client);
		expect(remote.state()).toEqual({
			remaining: complete ? 0 : 1,
			confirmed: complete ? 1 : 0,
			released: complete ? 0 : 1,
			holds: 0,
		});
		expect(
			remote.requests.filter((request) => request.endpoint === "reserve")
		).toHaveLength(1);
		expect(
			remote.requests
				.filter((request) => request.endpoint === "finalize")
				.every((request) => request.key === null)
		).toBe(true);
		const absent = provider();
		await settleInvestigationCharge({ ...input, complete }, absent.client);
		expect(absent.state().confirmed).toBe(0);
		expect(
			absent.requests.every((request) => request.endpoint === "finalize")
		).toBe(true);
	});

	it("rejects a lost reservation response and duplicate retry without authorizing work; explicit release only restores the hold", async () => {
		const remote = provider();
		const input = operation();
		remote.faults.push({ endpoint: "reserve", afterCommit: true, lost: true });
		await expect(
			reserveInvestigationCharge(input, remote.client)
		).rejects.toThrow();
		await expect(
			reserveInvestigationCharge(input, remote.client)
		).rejects.toThrow();
		expect(remote.state()).toEqual({
			remaining: 0,
			confirmed: 0,
			released: 0,
			holds: 1,
		});
		await settleInvestigationCharge(
			{ ...input, complete: false },
			remote.client
		);
		expect(remote.state()).toEqual({
			remaining: 1,
			confirmed: 0,
			released: 1,
			holds: 0,
		});
	});

	it("replays a lost confirmation response after native lock deletion without reserving or debiting again", async () => {
		const remote = provider();
		const input = operation();
		await reserveInvestigationCharge(input, remote.client);
		remote.faults.push({ endpoint: "finalize", afterCommit: true, lost: true });
		await expect(
			settleInvestigationCharge({ ...input, complete: true }, remote.client)
		).rejects.toThrow();
		await settleInvestigationCharge(
			{ ...input, complete: true },
			remote.client
		);
		expect(remote.state()).toEqual({
			remaining: 0,
			confirmed: 1,
			released: 0,
			holds: 0,
		});
		expect(
			remote.requests.filter((request) => request.endpoint === "reserve")
		).toHaveLength(1);
	});

	it.each([
		[202],
		[409],
		[500],
	])("rejects unconfirmed native status %i at reserve and settlement", async (status) => {
		const remote = provider();
		const input = operation();
		const body =
			status === 202
				? {
						allowed: true,
						success: true,
						customer_id: customerId,
						balance: null,
						flag: null,
					}
				: undefined;
		remote.faults.push({ endpoint: "reserve", status, body });
		await expect(
			reserveInvestigationCharge(input, remote.client)
		).rejects.toThrow();
		remote.faults.push({ endpoint: "finalize", status, body });
		await expect(
			settleInvestigationCharge({ ...input, complete: true }, remote.client)
		).rejects.toThrow();
		expect(remote.state().confirmed).toBe(0);
	});

	it.each([
		{
			code: "invalid_request",
			message: "Lock not found for ID: a-different-operation",
		},
		{ code: "server_error", message: "Lock not found" },
		{ code: "invalid_request", message: "Another validation problem" },
	])("does not swallow unrelated native finalize errors: %j", async (body) => {
		const remote = provider();
		remote.faults.push({ endpoint: "finalize", status: 400, body });
		await expect(
			settleInvestigationCharge(
				{ ...operation(), complete: true },
				remote.client
			)
		).rejects.toThrow();
	});

	it.each([
		[100],
	])("accepts the native %i monthly grant and $1 single-unit additional usage", async (grant) => {
		const remote = provider({ grant, remaining: 0, overage: true });
		const input = operation();
		await reserveInvestigationCharge(input, remote.client);
		await settleInvestigationCharge(
			{ ...input, complete: true },
			remote.client
		);
		expect(remote.state()).toEqual({
			remaining: -1,
			confirmed: 1,
			released: 0,
			holds: 0,
		});
		expect(remote.requests[0]?.body.required_balance).toBe(1);
	});

	it("accepts discounted and zero-cost attached usage terms without inventing a $1 invoice", async () => {
		for (const price of [
			{
				amount: 0.5,
				billing_units: 1,
				billing_method: "usage_based",
				max_purchase: null,
			},
			{
				amount: 0,
				billing_units: 100,
				billing_method: "usage_based",
				max_purchase: null,
			},
		]) {
			const remote = provider({ remaining: 0, overage: true, price });
			const input = operation();
			await reserveInvestigationCharge(input, remote.client);
			await settleInvestigationCharge(
				{ ...input, complete: true },
				remote.client
			);
			expect(remote.state()).toEqual({
				remaining: -1,
				confirmed: 1,
				released: 0,
				holds: 0,
			});
		}
	});

	it.each([
		[
			"higher unit price",
			{
				amount: 2,
				billing_units: 1,
				billing_method: "usage_based",
				max_purchase: null,
			},
		],
		[
			"rounded billing block",
			{
				amount: 1,
				billing_units: 10,
				billing_method: "usage_based",
				max_purchase: null,
			},
		],
		[
			"tiered price",
			{
				tiers: [{ to: "inf", amount: 1 }],
				billing_units: 1,
				billing_method: "usage_based",
				max_purchase: null,
			},
		],
		[
			"missing price amount",
			{ billing_units: 1, billing_method: "usage_based", max_purchase: null },
		],
	] as const)("rejects %s and releases the native hold", async (_label, price) => {
		const remote = provider({
			overage: true,
			remaining: 0,
			price: structuredClone(price) as NativePrice,
		});
		await expect(
			reserveInvestigationCharge(operation(), remote.client)
		).rejects.toThrow("price could not be verified");
		expect(remote.state()).toEqual({
			remaining: 0,
			confirmed: 0,
			released: 1,
			holds: 0,
		});
	});

	it("rejects missing price breakdown and wrong feature receipts, releasing an acknowledged hold", async () => {
		for (const options of [
			{ overage: true, breakdown: false },
			{ responseFeatureId: "different-feature" },
		]) {
			const remote = provider(options);
			await expect(
				reserveInvestigationCharge(operation(), remote.client)
			).rejects.toThrow();
			expect(remote.state()).toEqual({
				remaining: 1,
				confirmed: 0,
				released: 1,
				holds: 0,
			});
		}
	});

	it("never re-reserves an expired operation and asserts expiry before product persistence", async () => {
		const remote = provider();
		const input = operation();
		const reservation = await reserveInvestigationCharge(input, remote.client);
		expect(() =>
			assertInvestigationReservationActive(reservation)
		).not.toThrow();
		for (const startedAt of [
			new Date(Date.now() - 24 * 60 * 60 * 1000),
			new Date(Number.NaN),
		]) {
			await expect(
				reserveInvestigationCharge({ ...input, startedAt }, remote.client)
			).rejects.toThrow("expired");
		}
		expect(() =>
			assertInvestigationReservationActive({
				...reservation,
				expiresAt: new Date(0),
			})
		).toThrow("expired");
		expect(remote.requests).toHaveLength(1);
		await releaseInvestigationCharge(reservation, remote.client);
	});

	it("keeps provider billing implementation independent of PostgreSQL and Redis write modules", async () => {
		const source = await Bun.file(
			new URL("./investigation-billing.ts", import.meta.url)
		).text();
		const imports = new Bun.Transpiler({ loader: "ts" })
			.scan(source)
			.imports.map((entry) => entry.path);
		expect(
			imports.some(
				(path) =>
					path === "@databuddy/db" ||
					path.startsWith("@databuddy/db/") ||
					path === "@databuddy/redis" ||
					path === "pg"
			)
		).toBe(false);
	});
});

it("self-hosted production skips customer lookup, reservations and settlement", async () => {
	const original = process.env;
	process.env = {
		...original,
		SELFHOST: "true",
		NODE_ENV: "production",
		AUTUMN_SECRET_KEY: "stale-selfhost-key",
	};
	try {
		const remote = provider();
		const billing = await resolveInvestigationBilling(
			{ organizationId: "synthetic-org" },
			remote.client
		);
		expect(billing).toEqual({ mode: "unconfigured", customerId: null });
		expect(await canRunInvestigation(billing, remote.client)).toBe(true);
		const input = { ...operation(), billing };
		const reservation = await reserveInvestigationCharge(input, remote.client);
		await settleInvestigationCharge(
			{ ...input, complete: true },
			remote.client
		);
		await releaseInvestigationCharge(reservation, remote.client);
		expect(remote.requests).toEqual([]);
		expect(resolveCustomer).not.toHaveBeenCalled();
	} finally {
		process.env = original;
	}
});

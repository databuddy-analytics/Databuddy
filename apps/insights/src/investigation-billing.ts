import { resolveAgentBillingCustomerId } from "@databuddy/ai/agents/execution";
import { and, db, eq, inArray, isNull, lt, or } from "@databuddy/db";
import {
	insightObservations,
	investigationCharges,
	type InvestigationBillingMode,
} from "@databuddy/db/schema";
import { MIN_AGENT_CREDIT_CHECK_BALANCE } from "@databuddy/shared/agent-credits";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { Autumn, HTTPClient } from "autumn-js";
import { randomUUIDv7 } from "bun";
import { captureInsightsError } from "./lib/evlog-insights";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Charge = typeof investigationCharges.$inferSelect;
export interface InvestigationBilling {
	customerId: string | null;
	mode: InvestigationBillingMode;
}

const LOCK_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 60_000;

export function createInvestigationBillingClient(
	options: {
		secretKey?: string;
		fetcher?: NonNullable<
			ConstructorParameters<typeof HTTPClient>[0]
		>["fetcher"];
	} = {}
): Autumn {
	const secretKey = options.secretKey ?? process.env.AUTUMN_SECRET_KEY;
	if (!secretKey?.trim()) {
		throw new Error("Investigation billing is not configured");
	}
	const httpClient = new HTTPClient({ fetcher: options.fetcher });
	httpClient.addHook("response", (response) => {
		// SDK 1.2.23 also accepts a degraded 202 body. It is not a receipt.
		if (response.status === 202) {
			throw new Error("Investigation billing returned an unconfirmed response");
		}
	});
	return new Autumn({
		secretKey,
		httpClient,
		failOpen: false,
		timeoutMs: 5000,
		retryConfig: { strategy: "none" },
	});
}

export async function resolveInvestigationBilling(
	principal: { organizationId: string; userId?: string | null },
	client?: Autumn
): Promise<InvestigationBilling> {
	if (!(process.env.AUTUMN_SECRET_KEY?.trim() || client)) {
		if (process.env.NODE_ENV === "production") {
			throw new Error("Investigation billing is not configured");
		}
		return { mode: "unconfigured", customerId: null };
	}
	const customerId = await resolveAgentBillingCustomerId(principal);
	if (!customerId) {
		throw new Error("The investigation billing customer is unavailable");
	}
	const customer = await (
		client ?? createInvestigationBillingClient()
	).customers.get({ customerId });
	if (customer.id !== customerId) {
		throw new Error("The investigation billing customer could not be verified");
	}
	return {
		customerId,
		// Zero remaining units is still a fixed-price entitlement, never legacy/free.
		mode: Object.hasOwn(customer.balances, INVESTIGATION_USAGE.featureId)
			? "fixed"
			: "legacy",
	};
}

export async function canRunInvestigation(
	billing: InvestigationBilling,
	client?: Autumn
): Promise<boolean> {
	if (billing.mode === "unconfigured") {
		return true;
	}
	if (!billing.customerId) {
		throw new Error("The investigation billing customer is unavailable");
	}
	const result = await (client ?? createInvestigationBillingClient()).check({
		customerId: billing.customerId,
		featureId:
			billing.mode === "fixed"
				? INVESTIGATION_USAGE.featureId
				: "agent_credits",
		requiredBalance:
			billing.mode === "fixed" ? 1 : MIN_AGENT_CREDIT_CHECK_BALANCE,
	});
	if (result.customerId !== billing.customerId) {
		throw new Error("Investigation access could not be verified");
	}
	return result.allowed === true;
}

export async function reserveInvestigationCharge(
	input: {
		billing: InvestigationBilling;
		organizationId: string;
		websiteId: string;
		operationKey: string;
		runId?: string;
	},
	client?: Autumn
): Promise<Charge> {
	const now = new Date();
	await db
		.insert(investigationCharges)
		.values({
			id: randomUUIDv7(),
			operationKey: input.operationKey,
			organizationId: input.organizationId,
			websiteId: input.websiteId,
			runId: input.runId,
			customerId: input.billing.customerId,
			mode: input.billing.mode,
			featureId: INVESTIGATION_USAGE.featureId,
			priceCents:
				input.billing.mode === "fixed" ? INVESTIGATION_USAGE.priceUsd * 100 : 0,
			status: input.billing.mode === "fixed" ? "pending" : "reserved",
			expiresAt: new Date(now.getTime() + LOCK_MS),
		})
		.onConflictDoNothing({
			target: [
				investigationCharges.organizationId,
				investigationCharges.operationKey,
			],
		});
	const [charge] = await db
		.select()
		.from(investigationCharges)
		.where(
			and(
				eq(investigationCharges.organizationId, input.organizationId),
				eq(investigationCharges.operationKey, input.operationKey)
			)
		);
	if (!charge || charge.websiteId !== input.websiteId) {
		throw new Error("Investigation charge identity does not match");
	}
	if (charge.customerId !== input.billing.customerId) {
		throw new Error("The billing owner changed after this investigation began");
	}
	if (charge.mode !== "fixed") {
		return charge;
	}
	if (charge.status === "reserved" && charge.expiresAt > now) {
		return charge;
	}
	if (charge.status !== "pending" || charge.expiresAt <= now) {
		throw new Error(
			"This investigation reservation is unavailable; no new charge was created"
		);
	}
	const [claimed] = await db
		.update(investigationCharges)
		.set({ leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
		.where(
			and(
				eq(investigationCharges.id, charge.id),
				eq(investigationCharges.status, "pending"),
				or(
					isNull(investigationCharges.leaseUntil),
					lt(investigationCharges.leaseUntil, now)
				)
			)
		)
		.returning();
	if (!claimed?.leaseUntil) {
		throw new Error(
			"This investigation reservation is already being processed"
		);
	}
	try {
		if (!claimed.customerId) {
			throw new Error("The investigation billing customer is unavailable");
		}
		const result = await (client ?? createInvestigationBillingClient()).check(
			{
				customerId: claimed.customerId,
				featureId: claimed.featureId,
				requiredBalance: 1,
				sendEvent: true,
				lock: {
					enabled: true,
					lockId: claimed.id,
					expiresAt: claimed.expiresAt.getTime(),
				},
			},
			{ headers: { "Idempotency-Key": `investigation:${claimed.id}:reserve` } }
		);
		if (result.customerId !== claimed.customerId) {
			throw new Error("Investigation reservation could not be verified");
		}
		if (result.allowed && result.balance?.featureId !== claimed.featureId) {
			throw new Error(
				"Investigation reservation did not include the requested balance"
			);
		}
		const [reserved] = await db
			.update(investigationCharges)
			.set({
				status: result.allowed === true ? "reserved" : "denied",
				leaseUntil: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(investigationCharges.id, claimed.id),
					eq(investigationCharges.status, "pending"),
					eq(investigationCharges.leaseUntil, claimed.leaseUntil)
				)
			)
			.returning();
		if (!result.allowed) {
			throw new Error(
				"No investigations remaining. Add investigations to continue."
			);
		}
		if (!reserved) {
			throw new Error("Investigation reservation was not saved");
		}
		return reserved;
	} catch (error) {
		// A lost response might have reserved a unit. Abandon it safely; do not
		// infer permission from a duplicate 409 or invent a second reserve key.
		await db
			.update(investigationCharges)
			.set({
				status: "release_pending",
				leaseUntil: null,
				updatedAt: new Date(),
				errorMessage: error instanceof Error ? error.message : String(error),
			})
			.where(
				and(
					eq(investigationCharges.id, claimed.id),
					eq(investigationCharges.status, "pending"),
					eq(investigationCharges.leaseUntil, claimed.leaseUntil)
				)
			);
		throw error;
	}
}

export async function commitInvestigationCharge(
	tx: Transaction,
	input: {
		chargeId: string;
		observationId: string;
		complete: boolean;
	}
): Promise<void> {
	const [charge] = await tx
		.select()
		.from(investigationCharges)
		.where(eq(investigationCharges.id, input.chargeId))
		.for("update");
	if (!charge || charge.status !== "reserved") {
		throw new Error("Investigation reservation is not ready to complete");
	}
	if (charge.mode === "fixed" && charge.expiresAt <= new Date()) {
		throw new Error(
			"Investigation reservation expired before the answer was saved"
		);
	}
	const [observation] = await tx
		.select({ insightId: insightObservations.insightId })
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.id, input.observationId),
				eq(insightObservations.organizationId, charge.organizationId),
				eq(insightObservations.websiteId, charge.websiteId)
			)
		);
	if (
		!observation ||
		(charge.mode === "fixed" && input.complete && !observation.insightId)
	) {
		throw new Error(
			"A completed investigation must have a readable, scoped observation before charging"
		);
	}
	await tx
		.update(investigationCharges)
		.set({
			observationId: input.observationId,
			status:
				charge.mode === "fixed"
					? input.complete
						? "confirm_pending"
						: "release_pending"
					: "confirmed",
			updatedAt: new Date(),
		})
		.where(eq(investigationCharges.id, charge.id));
}

export async function releaseInvestigationCharge(
	chargeId: string,
	client?: Autumn
): Promise<void> {
	await db
		.update(investigationCharges)
		.set({ status: "release_pending", updatedAt: new Date() })
		.where(
			and(
				eq(investigationCharges.id, chargeId),
				eq(investigationCharges.mode, "fixed"),
				eq(investigationCharges.status, "reserved"),
				isNull(investigationCharges.observationId)
			)
		);
	await settleInvestigationCharge(chargeId, client);
}

export async function releaseInvestigationChargeForOperation(input: {
	organizationId: string;
	operationKey: string;
}): Promise<void> {
	const [charge] = await db
		.select({ id: investigationCharges.id })
		.from(investigationCharges)
		.where(
			and(
				eq(investigationCharges.organizationId, input.organizationId),
				eq(investigationCharges.operationKey, input.operationKey)
			)
		);
	if (charge) {
		await releaseInvestigationCharge(charge.id);
	}
}

export async function settleInvestigationCharge(
	chargeId: string,
	client?: Autumn
): Promise<void> {
	const now = new Date();
	const [charge] = await db
		.update(investigationCharges)
		.set({ leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
		.where(
			and(
				eq(investigationCharges.id, chargeId),
				eq(investigationCharges.mode, "fixed"),
				inArray(investigationCharges.status, [
					"confirm_pending",
					"release_pending",
				]),
				or(
					isNull(investigationCharges.leaseUntil),
					lt(investigationCharges.leaseUntil, now)
				)
			)
		)
		.returning();
	if (!charge?.leaseUntil) {
		return;
	}
	const claimed = and(
		eq(investigationCharges.id, charge.id),
		eq(investigationCharges.status, charge.status),
		eq(investigationCharges.leaseUntil, charge.leaseUntil)
	);
	if (charge.expiresAt <= now) {
		// The lock and provider idempotency protection have a bounded lifetime.
		// Never issue a fresh debit to recover an old uncertain settlement.
		await db
			.update(investigationCharges)
			.set({
				status: "review_required",
				leaseUntil: null,
				errorMessage: "Reservation expired before settlement was confirmed",
				updatedAt: now,
			})
			.where(claimed);
		return;
	}
	const action = charge.status === "confirm_pending" ? "confirm" : "release";
	if (action === "confirm" && !charge.observationId) {
		await db
			.update(investigationCharges)
			.set({
				status: "review_required",
				leaseUntil: null,
				errorMessage: "The completed observation is no longer available",
				updatedAt: now,
			})
			.where(claimed);
		return;
	}
	try {
		const result = await (
			client ?? createInvestigationBillingClient()
		).balances.finalize(
			{ lockId: charge.id, action },
			{
				headers: { "Idempotency-Key": `investigation:${charge.id}:${action}` },
			}
		);
		if (!result.success) {
			throw new Error("Investigation settlement was not confirmed");
		}
		await db
			.update(investigationCharges)
			.set({
				status: action === "confirm" ? "confirmed" : "released",
				leaseUntil: null,
				errorMessage: null,
				updatedAt: new Date(),
			})
			.where(claimed);
	} catch (error) {
		await db
			.update(investigationCharges)
			.set({
				leaseUntil: null,
				errorMessage: error instanceof Error ? error.message : String(error),
				updatedAt: new Date(),
			})
			.where(claimed);
		captureInsightsError(error, "investigation.billing.settlement_pending", {
			charge_id: charge.id,
			action,
		});
		throw error;
	}
}

export async function recoverInvestigationCharges(
	input?: {
		runId: string;
		websiteId: string;
	},
	client?: Autumn
): Promise<void> {
	const now = new Date();
	const scope = input
		? and(
				eq(investigationCharges.runId, input.runId),
				eq(investigationCharges.websiteId, input.websiteId)
			)
		: undefined;
	await db
		.update(investigationCharges)
		.set({ status: "released", updatedAt: now })
		.where(
			and(
				scope,
				eq(investigationCharges.mode, "fixed"),
				eq(investigationCharges.status, "pending"),
				isNull(investigationCharges.leaseUntil),
				lt(investigationCharges.createdAt, new Date(now.getTime() - LEASE_MS))
			)
		);
	await db
		.update(investigationCharges)
		.set({
			status: "review_required",
			leaseUntil: null,
			errorMessage: "Reservation expired without a completed observation",
			updatedAt: now,
		})
		.where(
			and(
				scope,
				eq(investigationCharges.mode, "fixed"),
				inArray(investigationCharges.status, ["pending", "reserved"]),
				lt(investigationCharges.expiresAt, now)
			)
		);
	// A worker may disappear during the reserve request. Its stale lease never
	// grants access; release the possibly held unit rather than reserve again.
	await db
		.update(investigationCharges)
		.set({ status: "release_pending", leaseUntil: null, updatedAt: now })
		.where(
			and(
				scope,
				eq(investigationCharges.mode, "fixed"),
				eq(investigationCharges.status, "pending"),
				lt(investigationCharges.leaseUntil, now)
			)
		);
	const pending = await db
		.select({ id: investigationCharges.id })
		.from(investigationCharges)
		.where(
			and(
				scope,
				eq(investigationCharges.mode, "fixed"),
				inArray(investigationCharges.status, [
					"confirm_pending",
					"release_pending",
				])
			)
		)
		.orderBy(investigationCharges.updatedAt)
		.limit(100);
	for (const charge of pending) {
		try {
			await settleInvestigationCharge(charge.id, client);
		} catch (error) {
			captureInsightsError(error, "investigation.billing.recovery_pending", {
				charge_id: charge.id,
			});
		}
	}
}

import { readBooleanEnv } from "@databuddy/env/boolean";
import { resolveAgentBillingCustomerId } from "@databuddy/ai/agents/execution";
import { createHash } from "node:crypto";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { Autumn, HTTPClient } from "autumn-js";
import { captureInsightsError } from "./lib/evlog-insights";

export interface InvestigationBilling {
	customerId: string | null;
	mode: "fixed" | "unconfigured";
}

const LOCK_MS = 23 * 60 * 60 * 1000;

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
	if (readBooleanEnv("SELFHOST")) {
		return { mode: "unconfigured", customerId: null };
	}
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
	return { customerId, mode: "fixed" };
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
		featureId: INVESTIGATION_USAGE.featureId,
		requiredBalance: 1,
	});
	if (result.customerId !== billing.customerId) {
		throw new Error("Investigation access could not be verified");
	}
	return result.allowed === true;
}

interface InvestigationOperation {
	operationKey: string;
	organizationId: string;
	websiteId: string;
}

export interface InvestigationReservation extends InvestigationBilling {
	expiresAt: Date;
	id: string;
}

function reservationId(input: InvestigationOperation): string {
	return `investigation:${createHash("sha256")
		.update(
			JSON.stringify([
				INVESTIGATION_USAGE.featureId,
				input.organizationId,
				input.websiteId,
				input.operationKey,
			])
		)
		.digest("hex")}`;
}

export async function reserveInvestigationCharge(
	input: InvestigationOperation & {
		billing: InvestigationBilling;
		startedAt: Date;
	},
	client?: Autumn
): Promise<InvestigationReservation> {
	const reservation = {
		...input.billing,
		id: reservationId(input),
		expiresAt: new Date(input.startedAt.getTime() + LOCK_MS),
	};
	if (reservation.mode === "unconfigured") {
		return reservation;
	}
	assertInvestigationReservationActive(reservation);
	if (!reservation.customerId) {
		throw new Error("The investigation billing customer is unavailable");
	}
	const autumn = client ?? createInvestigationBillingClient();
	// Autumn owns the hold. A duplicate/ambiguous response never authorizes work.
	// The immutable expiry is shorter than the provider's idempotency window:
	// a released/confirmed operation cannot be reserved again after that window.
	const result = await autumn.check(
		{
			customerId: reservation.customerId,
			featureId: INVESTIGATION_USAGE.featureId,
			requiredBalance: 1,
			sendEvent: true,
			lock: {
				enabled: true,
				lockId: reservation.id,
				expiresAt: reservation.expiresAt.getTime(),
			},
		},
		{ headers: { "Idempotency-Key": `${reservation.id}:reserve` } }
	);
	if (result.customerId !== reservation.customerId) {
		throw new Error("Investigation reservation could not be verified");
	}
	if (!result.allowed) {
		throw new Error(
			"No investigations remaining. Review your billing limit to continue."
		);
	}
	try {
		if (result.balance?.featureId !== INVESTIGATION_USAGE.featureId) {
			throw new Error(
				"Investigation reservation did not include the requested balance"
			);
		}
		if (result.balance.overageAllowed && !result.balance.unlimited) {
			const breakdown = result.balance.breakdown;
			if (
				!breakdown?.length ||
				breakdown.some(({ price }) => {
					if (price === null || price.billingMethod === "prepaid") {
						return false;
					}
					return (
						price.billingMethod !== "usage_based" ||
						price.tiers !== undefined ||
						price.tierBehavior !== undefined ||
						price.amount === undefined ||
						!Number.isFinite(price.amount) ||
						price.amount < 0 ||
						!Number.isFinite(price.billingUnits) ||
						price.billingUnits <= 0 ||
						(price.amount !== 0 && price.billingUnits !== 1) ||
						price.amount > INVESTIGATION_USAGE.priceUsd
					);
				})
			) {
				throw new Error(
					"The investigation overage price could not be verified within the accepted price"
				);
			}
		}
	} catch (error) {
		await releaseInvestigationCharge(reservation, autumn);
		throw error;
	}
	return reservation;
}

export function assertInvestigationReservationActive(
	reservation: InvestigationReservation
): void {
	if (
		reservation.mode === "fixed" &&
		(!Number.isFinite(reservation.expiresAt.getTime()) ||
			reservation.expiresAt.getTime() <= Date.now())
	) {
		throw new Error(
			"This investigation reservation expired. Start a new investigation."
		);
	}
}

async function finalizeReservation(
	id: string,
	complete: boolean,
	client?: Autumn
): Promise<void> {
	if (readBooleanEnv("SELFHOST")) {
		return;
	}
	if (!(client || process.env.AUTUMN_SECRET_KEY?.trim())) {
		if (process.env.NODE_ENV !== "production") {
			return;
		}
		throw new Error("Investigation billing is not configured");
	}
	try {
		// Full confirmation does not debit again. Replays only finalize this lock;
		// they must never reserve or track a replacement unit for a saved result.
		const result = await (
			client ?? createInvestigationBillingClient()
		).balances.finalize({
			lockId: id,
			action: complete ? "confirm" : "release",
		});
		if (!result.success) {
			throw new Error("Investigation settlement was not confirmed");
		}
	} catch (error) {
		if (
			error instanceof Error &&
			"statusCode" in error &&
			error.statusCode === 400 &&
			"body" in error &&
			typeof error.body === "string"
		) {
			let body: unknown;
			try {
				body = JSON.parse(error.body);
			} catch {
				/* Non-JSON provider failures remain failures. */
			}
			if (
				body &&
				typeof body === "object" &&
				"code" in body &&
				"message" in body &&
				body.code === "invalid_request" &&
				body.message === `Lock not found for ID: ${id}`
			) {
				// Missing can mean confirmed, released, or expired. Nothing remains to
				// finalize; it is not proof of payment and never warrants a new debit.
				if (complete) {
					captureInsightsError(
						new Error("Investigation charge lock was gone before confirmation"),
						"investigation_billing.settlement_unconfirmed",
						{ lock_id: id }
					);
				}
				return;
			}
		}
		throw error;
	}
}

export async function settleInvestigationCharge(
	input: InvestigationOperation & { complete: boolean },
	client?: Autumn
): Promise<void> {
	await finalizeReservation(reservationId(input), input.complete, client);
}

export async function releaseInvestigationCharge(
	reservation: InvestigationReservation,
	client?: Autumn
): Promise<void> {
	if (reservation.mode === "fixed") {
		await finalizeReservation(reservation.id, false, client);
	}
}

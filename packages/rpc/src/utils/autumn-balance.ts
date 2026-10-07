import { AutumnError, ResponseValidationError } from "autumn-js";
import { getAutumn, isBillingUnavailable } from "../lib/autumn-client";

class AutumnBalanceUpdateError extends Error {
	readonly definitiveFailure: boolean;

	constructor(cause: unknown) {
		super(
			`Autumn balance update failed: ${cause instanceof Error ? cause.message : String(cause)}`,
			{ cause }
		);
		this.name = "AutumnBalanceUpdateError";
		this.definitiveFailure =
			isBillingUnavailable(cause) ||
			(cause instanceof AutumnError &&
				!(cause instanceof ResponseValidationError) &&
				cause.statusCode >= 400 &&
				cause.statusCode < 500);
	}
}

export function isDefinitiveAutumnBalanceFailure(error: unknown): boolean {
	return error instanceof AutumnBalanceUpdateError && error.definitiveFailure;
}

export async function updateAutumnBalance(input: {
	amount: number;
	customerId: string;
	featureId: string;
	redemptionId: string;
}): Promise<void> {
	try {
		await getAutumn().balances.update(
			{
				customerId: input.customerId,
				featureId: input.featureId,
				addToBalance: input.amount,
			},
			{
				headers: {
					"Idempotency-Key": `feedback-redemption:${input.redemptionId}`,
				},
			}
		);
	} catch (error) {
		throw new AutumnBalanceUpdateError(error);
	}
}

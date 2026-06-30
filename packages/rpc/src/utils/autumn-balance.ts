const AUTUMN_BALANCE_TIMEOUT_MS = 10_000;

export class AutumnBalanceUpdateError extends Error {
	readonly definitiveFailure: boolean;

	constructor(message: string, definitiveFailure: boolean) {
		super(message);
		this.definitiveFailure = definitiveFailure;
		this.name = "AutumnBalanceUpdateError";
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
	secretKey?: string | null;
}): Promise<void> {
	const secretKey = input.secretKey ?? process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) {
		throw new AutumnBalanceUpdateError("AUTUMN_SECRET_KEY is not set", true);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		AUTUMN_BALANCE_TIMEOUT_MS
	);
	try {
		const response = await fetch(
			"https://api.useautumn.com/v1/balances.update",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${secretKey}`,
					"Idempotency-Key": `feedback-redemption:${input.redemptionId}`,
				},
				body: JSON.stringify({
					customer_id: input.customerId,
					feature_id: input.featureId,
					add_to_balance: input.amount,
				}),
				signal: controller.signal,
			}
		);

		if (!response.ok) {
			const body = await response.text();
			throw new AutumnBalanceUpdateError(
				`Autumn API ${response.status}: ${body}`,
				response.status < 500
			);
		}
	} finally {
		clearTimeout(timeoutId);
	}
}

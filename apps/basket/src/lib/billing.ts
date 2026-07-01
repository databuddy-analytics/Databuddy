import { getAutumn } from "@databuddy/rpc/autumn";
import { basketErrors } from "@lib/structured-errors";
import { captureError, record } from "@lib/tracing";
import { EvlogError } from "evlog";
import { useLogger } from "evlog/elysia";

interface BillingResult {
	allowed: true;
}

export function checkAutumnUsage(
	customerId: string,
	featureId: string,
	properties?: Record<string, unknown>,
	quantity = 1
): Promise<BillingResult> {
	return record("checkAutumnUsage", async (): Promise<BillingResult> => {
		const log = useLogger();

		try {
			const response = await record("autumn.check", () =>
				getAutumn().check({
					customerId,
					featureId,
					sendEvent: true,
					requiredBalance: quantity,
					properties,
				})
			);

			const b = response.balance;
			log.set({
				billing: {
					allowed: response.allowed,
					usage: b?.usage,
					granted: b?.granted,
					unlimited: b?.unlimited,
				},
			});

			if (!response.allowed) {
				log.warn("Event quota exceeded", {
					customerId,
					featureId,
					properties,
					billing: {
						usage: b?.usage,
						granted: b?.granted,
						unlimited: b?.unlimited,
					},
				});
				throw basketErrors.billingLimitExceeded();
			}

			return { allowed: true };
		} catch (error) {
			if (error instanceof EvlogError) {
				throw error;
			}

			log.set({ billing: { allowed: false, checkFailed: true } });
			captureError(error, {
				message: "Autumn check failed, rejecting event",
			});
			throw basketErrors.billingCheckUnavailable();
		}
	});
}

import { getAutumn } from "@databuddy/rpc/autumn";
import { captureError, record } from "@lib/tracing";
import { useLogger } from "evlog/elysia";

interface BillingResult {
	allowed: true;
}

export function checkAutumnUsage(
	customerId: string,
	featureId: string,
	properties?: Record<string, unknown>
): Promise<BillingResult> {
	return record("checkAutumnUsage", async (): Promise<BillingResult> => {
		const log = useLogger();

		try {
			const response = await record("autumn.check", () =>
				getAutumn().check({
					customerId,
					featureId,
					sendEvent: true,
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

			return { allowed: true };
		} catch (error) {
			log.set({ billing: { allowed: true, checkFailed: true } });
			captureError(error, {
				message: "Autumn check failed, allowing event through",
			});
			return { allowed: true };
		}
	});
}

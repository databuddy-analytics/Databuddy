import { captureError, record } from "@lib/tracing";
import { Autumn as autumn } from "autumn-js";
import { useLogger } from "evlog/elysia";

type BillingResult = { allowed: true } | { exceeded: true; response: Response };

export function checkAutumnUsage(
	customerId: string,
	featureId: string,
	properties?: Record<string, unknown>
): Promise<BillingResult> {
	return record("checkAutumnUsage", async (): Promise<BillingResult> => {
		const log = useLogger();

		try {
			const result = await record("autumn.check", () =>
				autumn.check({
					customer_id: customerId,
					feature_id: featureId,
					send_event: true,
					// @ts-expect-error autumn types are not up to date
					properties,
				})
			);
			const data = result.data;

			if (data) {
				log.set({
					billing: {
						allowed: true,
						usage: data.usage,
						usageLimit: data.usage_limit,
						includedUsage: data.included_usage,
						unlimited: data.unlimited,
					},
				});
				const usage = data.usage ?? 0;
				const usageLimit = data.usage_limit ?? data.included_usage ?? 0;
				const isUnlimited = data.unlimited ?? false;
				const usageExceeds150Percent =
					!isUnlimited && usageLimit > 0 && usage >= usageLimit * 1.5;

				if (usageExceeds150Percent) {
					log.set({
						billing: { allowed: false, usage, usageLimit, exceeded: true },
					});
					return {
						exceeded: true,
						response: new Response(
							JSON.stringify({
								status: "error",
								message: "Exceeded event limit",
							}),
							{
								status: 429,
								headers: { "Content-Type": "application/json" },
							}
						),
					};
				}
			}

			log.set({ billing: { allowed: true } });
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

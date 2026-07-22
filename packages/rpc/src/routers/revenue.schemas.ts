import { isCurrencyCode } from "@databuddy/shared/currency";
import { z } from "zod";

export const revenueCurrencySchema = z
	.string()
	.trim()
	.toUpperCase()
	.refine(isCurrencyCode, "Enter a valid ISO 4217 currency code");

export const revenueUpsertInputSchema = z.object({
	websiteId: z.string().optional(),
	stripeWebhookSecret: z.string().optional(),
	paddleWebhookSecret: z.string().optional(),
	currency: revenueCurrencySchema.optional(),
});

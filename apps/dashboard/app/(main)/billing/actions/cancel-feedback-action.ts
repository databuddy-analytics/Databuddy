"use server";

import { auth } from "@databuddy/auth";
import { config } from "@databuddy/env/app";
import { Databuddy } from "@databuddy/sdk/node";
import { useLogger } from "evlog/next";
import { headers } from "next/headers";
import { withEvlog } from "@/lib/evlog";
import type { CancelFeedback } from "../components/cancel-subscription-dialog";

const databuddyApiKey = config.services.databuddyApiKey;
const client = databuddyApiKey
	? new Databuddy({
			apiKey: databuddyApiKey,
			websiteId: process.env.DATABUDDY_WEBSITE_ID,
			debug: process.env.NODE_ENV === "development",
		})
	: null;

const VALID_REASONS = [
	"too_expensive",
	"missing_features",
	"not_using",
	"switching",
	"technical_issues",
	"other",
] as const;

interface TrackCancelFeedbackParams {
	feedback: CancelFeedback;
	immediate: boolean;
	planId: string;
	planName: string;
}

export const trackCancelFeedbackAction = withEvlog(
	async ({
		feedback,
		planId,
		planName,
		immediate,
	}: TrackCancelFeedbackParams): Promise<{ success: boolean }> => {
		const log = useLogger();
		log.set({
			action: "track_cancel_feedback",
			cancellation: { plan_id: planId, reason: feedback.reason },
		});
		try {
			const session = await auth.api.getSession({
				headers: await headers(),
			});
			if (!session) {
				return { success: false };
			}

			if (!VALID_REASONS.includes(feedback.reason)) {
				return { success: false };
			}

			if (!client) {
				return { success: true };
			}

			const result = await client.track({
				name: "subscription_cancelled",
				properties: {
					reason: feedback.reason,
					details: feedback.details?.trim() ?? null,
					plan_id: planId,
					plan_name: planName,
					cancelled_immediately: immediate,
				},
			});
			if (!result.success) {
				return { success: false };
			}

			await client.flush();

			return { success: true };
		} catch (error) {
			log.error(error instanceof Error ? error : String(error));
			return { success: false };
		}
	}
);

"use server";

import { Databuddy } from "@databuddy/sdk/node";
import type { CancelFeedback } from "../components/cancel-subscription-dialog";

const client = new Databuddy({
	apiKey: process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ?? "",
	debug: process.env.NODE_ENV === "development",
});

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

export async function trackCancelFeedbackAction({
	feedback,
	planId,
	planName,
	immediate,
}: TrackCancelFeedbackParams): Promise<{ success: boolean }> {
	if (!VALID_REASONS.includes(feedback.reason)) {
		return { success: false };
	}

	try {
		await client.track({
			name: "subscription_cancelled",
			properties: {
				reason: feedback.reason,
				details: feedback.details?.trim() ?? null,
				plan_id: planId,
				plan_name: planName,
				cancelled_immediately: immediate,
			},
		});

		await client.flush();

		return { success: true };
	} catch (error) {
		console.error("Failed to track cancellation feedback:", error);
		return { success: false };
	}
}

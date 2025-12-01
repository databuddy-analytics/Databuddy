"use server";

import { Databuddy } from "@databuddy/sdk/node";
import type { ActionResponse, Feedback } from "@/components/feedback";

const client = new Databuddy({
    clientId: process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ?? "OXmNQsViBT-FOS_wZCTHc",
    debug: process.env.NODE_ENV === "development",
});

const MAX_MESSAGE_LENGTH = 1000;
const VALID_OPINIONS = ["good", "bad"] as const;

export async function onRateDocs(
    url: string,
    feedback: Feedback
): Promise<ActionResponse> {

    if (!VALID_OPINIONS.includes(feedback.opinion)) {
        return { success: false, error: "Please select good or bad" };
    }

    if (typeof feedback.message !== "string") {
        return { success: false, error: "Message is required" };
    }

    const trimmedMessage = feedback.message.trim();

    if (trimmedMessage.length === 0) {
        return { success: false, error: "Message cannot be empty" };
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
        return { success: false, error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` };
    }

    try {
        await client.track({
            name: "docs_feedback",
            properties: {
                url,
                opinion: feedback.opinion,
                message: trimmedMessage,
            },
        });

        await client.flush();

        return { success: true };
    } catch (error) {
        console.error("Failed to capture docs feedback:", error);
        return { success: false, error: "Something went wrong. Please try again." };
    }
}


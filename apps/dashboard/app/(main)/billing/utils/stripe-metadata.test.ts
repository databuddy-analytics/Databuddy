import { expect, mock, test } from "bun:test";

let clientId: string | undefined = "active-website";
mock.module("@databuddy/sdk", () => ({
	getTracker: () => (clientId ? { options: { clientId } } : null),
	getProfileId: () => "profile-example",
	getTrackingIds: () => ({
		anonId: "anonymous-example",
		sessionId: "session-example",
	}),
}));

const { getStripeMetadata } = await import("./stripe-metadata");

test("billing metadata uses the active tracker website without guessing a fallback", () => {
	expect(getStripeMetadata()).toEqual({
		databuddy_client_id: "active-website",
		databuddy_profile_id: "profile-example",
		databuddy_anonymous_id: "anonymous-example",
		databuddy_session_id: "session-example",
	});
	clientId = undefined;
	expect(getStripeMetadata()).not.toHaveProperty("databuddy_client_id");
});

import { getProfileId, getTracker, getTrackingIds } from "@databuddy/sdk";

export function getStripeMetadata(): Record<string, string> {
	const { anonId, sessionId } = getTrackingIds();
	const profileId = getProfileId();
	const clientId = getTracker()?.options.clientId;
	const metadata: Record<string, string> = {};
	if (clientId) {
		metadata.databuddy_client_id = clientId;
	}
	if (sessionId) {
		metadata.databuddy_session_id = sessionId;
	}
	if (anonId) {
		metadata.databuddy_anonymous_id = anonId;
	}
	if (profileId) {
		metadata.databuddy_profile_id = profileId;
	}
	return metadata;
}

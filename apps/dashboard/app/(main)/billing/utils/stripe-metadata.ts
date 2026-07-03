import { getProfileId, getTrackingIds } from "@databuddy/sdk";

const DATABUDDY_CLIENT_ID =
	process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ?? "OXmNQsViBT-FOS_wZCTHc";

export function getStripeMetadata(): Record<string, string> {
	const { anonId, sessionId } = getTrackingIds();
	const profileId = getProfileId();
	const metadata: Record<string, string> = {
		databuddy_client_id: DATABUDDY_CLIENT_ID,
	};
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

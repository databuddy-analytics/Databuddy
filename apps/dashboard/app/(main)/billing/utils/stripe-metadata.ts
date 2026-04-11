import { getTrackingIds } from "@databuddy/sdk";

const DATABUDDY_CLIENT_ID = process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID;

export function getStripeMetadata(): Record<string, string> {
	const { anonId, sessionId } = getTrackingIds();
	const metadata: Record<string, string> = {};
	if (DATABUDDY_CLIENT_ID) {
		metadata.databuddy_client_id = DATABUDDY_CLIENT_ID;
	}
	if (sessionId) {
		metadata.databuddy_session_id = sessionId;
	}
	if (anonId) {
		metadata.databuddy_anonymous_id = anonId;
	}
	return metadata;
}

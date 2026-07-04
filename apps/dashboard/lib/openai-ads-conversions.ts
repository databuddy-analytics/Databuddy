import { createHash } from "node:crypto";

const REGISTRATION_EVENT_TYPE = "registration_completed";
const CUSTOMER_ACTION_TYPE = "customer_action";

interface BuildRegistrationEventInput {
	email?: string;
	eventId: string;
	ipAddress?: string;
	oppref?: string;
	sourceUrl: string;
	timestampMs: number;
	userAgent?: string;
}

export interface OpenAiAdsRegistrationEvent {
	action_source: "web";
	data: {
		type: typeof CUSTOMER_ACTION_TYPE;
	};
	id: string;
	oppref?: string;
	source_url: string;
	timestamp_ms: number;
	type: typeof REGISTRATION_EVENT_TYPE;
	user?: {
		email_sha256?: string;
		ip_address?: string;
		user_agent?: string;
	};
}

export function hashOpenAiUserValue(value: string): string {
	return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function buildOpenAiRegistrationCompletedEvent(
	input: BuildRegistrationEventInput
): OpenAiAdsRegistrationEvent {
	const user: NonNullable<OpenAiAdsRegistrationEvent["user"]> = {};

	if (input.email) {
		user.email_sha256 = hashOpenAiUserValue(input.email);
	}
	if (input.ipAddress) {
		user.ip_address = input.ipAddress;
	}
	if (input.userAgent) {
		user.user_agent = input.userAgent;
	}

	return {
		action_source: "web",
		data: { type: CUSTOMER_ACTION_TYPE },
		id: input.eventId,
		...(input.oppref ? { oppref: input.oppref } : {}),
		source_url: input.sourceUrl,
		timestamp_ms: input.timestampMs,
		type: REGISTRATION_EVENT_TYPE,
		...(Object.keys(user).length ? { user } : {}),
	};
}

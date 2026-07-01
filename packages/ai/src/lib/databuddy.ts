import { Databuddy } from "@databuddy/sdk/node";

const apiKey = process.env.DATABUDDY_API_KEY;
const websiteId = process.env.DATABUDDY_WEBSITE_ID;

function createClient(source: string, namespace?: string) {
	if (!(apiKey && websiteId)) {
		return null;
	}
	return new Databuddy({
		apiKey,
		websiteId,
		source,
		namespace,
		enableBatching: true,
		debug: process.env.NODE_ENV === "development",
	});
}

const agentClient = createClient("api", "agent");
const mutationClient = createClient("dashboard");

export function trackAgentEvent(
	name: string,
	properties?: Record<string, unknown>
): void {
	agentClient?.track({ name, properties }).catch(() => {});
}

export function trackMutationEvent(
	name: string,
	opts: {
		namespace: string;
		sessionId?: string | null;
		anonymousId?: string | null;
		properties?: Record<string, unknown>;
	}
): void {
	mutationClient
		?.track({
			name,
			namespace: opts.namespace,
			sessionId: opts.sessionId ?? undefined,
			anonymousId: opts.anonymousId ?? undefined,
			properties: opts.properties,
		})
		.catch(() => {});
}

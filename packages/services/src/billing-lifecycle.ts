import { config } from "@databuddy/env/app";
import { Databuddy } from "@databuddy/sdk/node";
import { PLAN_IDS } from "@databuddy/shared/types/features";
import { splitTraits, upsertProfile } from "./identity";

const selfAnalyticsApiKey = process.env.SELF_ANALYTICS_API_KEY;
const selfAnalytics = selfAnalyticsApiKey
	? new Databuddy({
			apiKey: selfAnalyticsApiKey,
			apiUrl: config.urls.basket,
			enableBatching: false,
		})
	: null;

const SCENARIO_EVENTS = {
	new: "subscription_started",
	upgrade: "plan_upgraded",
	downgrade: "plan_downgraded",
	renew: "subscription_renewed",
	cancel: "subscription_canceled",
	expired: "subscription_expired",
	past_due: "payment_past_due",
	scheduled: "plan_change_scheduled",
} as const;

export type BillingScenario = keyof typeof SCENARIO_EVENTS;

const PLAN_SETTING_SCENARIOS = new Set<BillingScenario>([
	"new",
	"upgrade",
	"downgrade",
	"renew",
]);

function planAfterScenario(
	scenario: BillingScenario,
	planId: string
): string | null {
	if (PLAN_SETTING_SCENARIOS.has(scenario)) {
		return planId;
	}
	if (scenario === "expired") {
		return PLAN_IDS.FREE;
	}
	return null;
}

export async function recordSelfAnalyticsEvent(opts: {
	profileId: string;
	eventName: string;
	properties: Record<string, string>;
	source: string;
}): Promise<void> {
	const websiteId = process.env.SELF_ANALYTICS_WEBSITE_ID;
	if (!websiteId) {
		return;
	}
	await trackLifecycleEvent({
		websiteId,
		profileId: opts.profileId,
		name: opts.eventName,
		properties: opts.properties,
		source: opts.source,
	});
}

async function trackLifecycleEvent(event: {
	eventId?: string;
	name: string;
	profileId: string;
	properties: Record<string, string>;
	source: string;
	websiteId: string;
}): Promise<void> {
	if (!selfAnalytics) {
		return;
	}
	const result = await selfAnalytics.track(event);
	if (!result.success) {
		throw new Error(
			`Self-analytics event ${event.name} was rejected: ${result.error ?? result.code ?? "unknown error"}`
		);
	}
}

export async function recordPlanChange(opts: {
	customerId: string;
	eventId?: string;
	planId: string;
	scenario: BillingScenario;
}): Promise<void> {
	const websiteId = process.env.SELF_ANALYTICS_WEBSITE_ID;
	if (!websiteId) {
		return;
	}

	const plan = planAfterScenario(opts.scenario, opts.planId);

	await Promise.all([
		plan
			? upsertProfile(
					websiteId,
					opts.customerId,
					splitTraits({ plan }),
					"billing"
				)
			: Promise.resolve(null),
		trackLifecycleEvent({
			websiteId,
			eventId: opts.eventId,
			profileId: opts.customerId,
			name: SCENARIO_EVENTS[opts.scenario],
			properties: {
				plan: opts.planId,
				scenario: opts.scenario,
			},
			source: "billing",
		}),
	]);
}

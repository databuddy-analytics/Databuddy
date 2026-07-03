import { db, eq, websites as websitesTable } from "@databuddy/db";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { PLAN_IDS } from "@databuddy/shared/types/features";
import { splitTraits, upsertProfile } from "./identity";

const SCENARIO_EVENTS: Record<string, string> = {
	new: "subscription_started",
	upgrade: "plan_upgraded",
	downgrade: "plan_downgraded",
	renew: "subscription_renewed",
	cancel: "subscription_canceled",
	expired: "subscription_expired",
	past_due: "payment_past_due",
	scheduled: "plan_change_scheduled",
};

const PLAN_SETTING_SCENARIOS = new Set([
	"new",
	"upgrade",
	"downgrade",
	"renew",
]);

function selfWebsiteId(): string {
	return process.env.SELF_ANALYTICS_WEBSITE_ID || "";
}

function planAfterScenario(scenario: string, planId: string): string | null {
	if (PLAN_SETTING_SCENARIOS.has(scenario)) {
		return planId;
	}
	if (scenario === "expired") {
		return PLAN_IDS.FREE;
	}
	return null;
}

async function insertLifecycleEvent(
	websiteId: string,
	customerId: string,
	eventName: string,
	properties: Record<string, string>
): Promise<void> {
	const [website] = await db
		.select({ organizationId: websitesTable.organizationId })
		.from(websitesTable)
		.where(eq(websitesTable.id, websiteId))
		.limit(1);
	if (!website) {
		return;
	}
	await clickHouse.insert({
		table: TABLE_NAMES.custom_events,
		values: [
			{
				owner_id: website.organizationId,
				website_id: websiteId,
				timestamp: Date.now(),
				event_name: eventName,
				properties: JSON.stringify(properties),
				profile_id: customerId,
				source: "billing",
			},
		],
		format: "JSONEachRow",
	});
}

export async function recordPlanChange(opts: {
	customerId: string;
	planId: string;
	scenario: string;
}): Promise<void> {
	const websiteId = selfWebsiteId();
	if (!websiteId) {
		return;
	}

	const plan = planAfterScenario(opts.scenario, opts.planId);
	const eventName = SCENARIO_EVENTS[opts.scenario];

	await Promise.all([
		plan
			? upsertProfile(
					websiteId,
					opts.customerId,
					splitTraits({ plan }),
					"billing"
				)
			: Promise.resolve(null),
		eventName
			? insertLifecycleEvent(websiteId, opts.customerId, eventName, {
					plan: opts.planId,
					scenario: opts.scenario,
				})
			: Promise.resolve(),
	]);
}

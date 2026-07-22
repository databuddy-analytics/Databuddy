import { beforeAll, describe, expect, it } from "bun:test";
import { chCommand } from "@databuddy/db/clickhouse";
import { randomUUIDv7 } from "bun";
import {
	getTotalWebsiteUsers,
	processFunnelAnalytics,
	processFunnelConversionCounts,
	processGoalAnalytics,
	queryLinkVisitorIds,
} from "./analytics-utils";

const describeIntegration =
	process.env.CLICKHOUSE_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const testPrefix = randomUUIDv7();
const profileWebsiteId = `identity-profile-${testPrefix}`;
const sessionWebsiteId = `identity-session-${testPrefix}`;
const afterContextWebsiteId = `context-after-${testPrefix}`;
const crossSessionWebsiteId = `context-cross-session-${testPrefix}`;
const sameTimeWebsiteId = `context-same-time-${testPrefix}`;
const reassignedAnonymousWebsiteId = `identity-reassigned-${testPrefix}`;
const changedSessionProfileWebsiteId = `identity-session-change-${testPrefix}`;
const repeatedEntryWebsiteId = `funnel-repeated-entry-${testPrefix}`;
const startDate = "2026-01-01";
const endDate = "2026-01-02 23:59:59";

function queryParams(websiteId: string) {
	return { endDate, startDate, websiteId };
}

describeIntegration("goal and funnel visitor identity", () => {
	beforeAll(async () => {
		await chCommand(
			`INSERT INTO analytics.events
				(id, client_id, event_name, anonymous_id, time, session_id, url, path, ip, user_agent, properties, created_at, profile_id, utm_source)
			VALUES
				(toUUID({profileEventId:String}), {profileWebsiteId:String}, 'screen_view', 'profile-anon', toDateTime64('2026-01-01 12:00:00', 3), 'profile-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 12:00:00', 3), '', 'newsletter'),
				(toUUID({sessionEventId:String}), {sessionWebsiteId:String}, 'screen_view', 'session-anon', toDateTime64('2026-01-01 12:00:00', 3), 'session-1', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 12:00:00', 3), '', 'newsletter')`,
			{
				profileEventId: randomUUIDv7(),
				profileWebsiteId,
				sessionEventId: randomUUIDv7(),
				sessionWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.custom_events
				(owner_id, website_id, timestamp, event_name, properties, anonymous_id, session_id, profile_id)
			VALUES
				({profileWebsiteId:String}, {profileWebsiteId:String}, toDateTime64('2026-01-01 11:59:00', 3), 'identify', '{}', 'profile-anon', NULL, 'profile-1'),
				({profileWebsiteId:String}, {profileWebsiteId:String}, toDateTime64('2026-01-01 12:01:00', 3), 'purchase', '{}', NULL, NULL, 'profile-1'),
				({sessionWebsiteId:String}, {sessionWebsiteId:String}, toDateTime64('2026-01-01 11:59:00', 3), 'purchase', '{}', NULL, 'session-1', ''),
				({sessionWebsiteId:String}, {sessionWebsiteId:String}, toDateTime64('2026-01-01 12:01:00', 3), 'purchase', '{}', NULL, 'session-1', '')`,
			{ profileWebsiteId, sessionWebsiteId }
		);
		await chCommand(
			`INSERT INTO analytics.events
				(id, client_id, event_name, anonymous_id, time, session_id, url, path, ip, user_agent, properties, created_at, profile_id, utm_source)
			VALUES
				(toUUID({afterEventId:String}), {afterWebsiteId:String}, 'screen_view', 'after-anon', toDateTime64('2026-01-01 12:02:00', 3), 'after-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 12:02:00', 3), '', 'newsletter'),
				(toUUID({crossEventId:String}), {crossWebsiteId:String}, 'screen_view', 'cross-anon', toDateTime64('2026-01-01 12:00:00', 3), 'cross-browser-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 12:00:00', 3), '', 'newsletter'),
				(toUUID({sameEventId:String}), {sameWebsiteId:String}, 'screen_view', 'same-anon', toDateTime64('2026-01-01 12:00:00', 3), 'same-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 12:00:00', 3), '', 'newsletter')`,
			{
				afterEventId: randomUUIDv7(),
				afterWebsiteId: afterContextWebsiteId,
				crossEventId: randomUUIDv7(),
				crossWebsiteId: crossSessionWebsiteId,
				sameEventId: randomUUIDv7(),
				sameWebsiteId: sameTimeWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.custom_events
				(owner_id, website_id, timestamp, event_name, properties, anonymous_id, session_id, profile_id)
			VALUES
				({afterWebsiteId:String}, {afterWebsiteId:String}, toDateTime64('2026-01-01 12:01:00', 3), 'purchase', '{}', 'after-anon', 'after-session', ''),
				({crossWebsiteId:String}, {crossWebsiteId:String}, toDateTime64('2026-01-01 12:01:00', 3), 'purchase', '{}', 'cross-anon', 'cross-purchase-session', ''),
				({sameWebsiteId:String}, {sameWebsiteId:String}, toDateTime64('2026-01-01 12:00:00', 3), 'purchase', '{}', 'same-anon', 'same-session', '')`,
			{
				afterWebsiteId: afterContextWebsiteId,
				crossWebsiteId: crossSessionWebsiteId,
				sameWebsiteId: sameTimeWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.events
				(id, client_id, event_name, anonymous_id, time, session_id, url, path, ip, user_agent, properties, created_at, profile_id)
			VALUES
				(toUUID({firstViewId:String}), {websiteId:String}, 'screen_view', 'shared-browser', toDateTime64('2026-01-01 10:00:00', 3), 'first-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 10:00:00', 3), ''),
				(toUUID({secondViewId:String}), {websiteId:String}, 'screen_view', 'shared-browser', toDateTime64('2026-01-02 10:00:00', 3), 'second-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-02 10:00:00', 3), ''),
				(toUUID({changedEntryId:String}), {changedWebsiteId:String}, 'screen_view', 'changed-session-browser', toDateTime64('2026-01-01 10:00:00', 3), 'changed-profile-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 10:00:00', 3), '')`,
			{
				changedEntryId: randomUUIDv7(),
				changedWebsiteId: changedSessionProfileWebsiteId,
				firstViewId: randomUUIDv7(),
				secondViewId: randomUUIDv7(),
				websiteId: reassignedAnonymousWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.custom_events
				(owner_id, website_id, timestamp, event_name, properties, anonymous_id, session_id, profile_id)
			VALUES
				({websiteId:String}, {websiteId:String}, toDateTime64('2026-01-01 10:01:00', 3), 'identify', '{}', 'shared-browser', 'first-session', 'profile-one'),
				({websiteId:String}, {websiteId:String}, toDateTime64('2026-01-01 10:02:00', 3), 'purchase', '{}', 'shared-browser', 'first-session', 'profile-one'),
				({websiteId:String}, {websiteId:String}, toDateTime64('2026-01-02 10:01:00', 3), 'identify', '{}', 'shared-browser', 'second-session', 'profile-two'),
				({websiteId:String}, {websiteId:String}, toDateTime64('2026-01-02 10:02:00', 3), 'purchase', '{}', 'shared-browser', 'second-session', 'profile-two'),
				({changedWebsiteId:String}, {changedWebsiteId:String}, toDateTime64('2026-01-01 10:00:30', 3), 'identify', '{}', 'changed-session-browser', 'changed-profile-session', 'profile-one'),
				({changedWebsiteId:String}, {changedWebsiteId:String}, toDateTime64('2026-01-01 10:01:00', 3), 'purchase', '{}', 'changed-session-browser', 'changed-profile-session', 'profile-one'),
				({changedWebsiteId:String}, {changedWebsiteId:String}, toDateTime64('2026-01-01 10:02:00', 3), 'identify', '{}', 'changed-session-browser', 'changed-profile-session', 'profile-two')`,
			{
				changedWebsiteId: changedSessionProfileWebsiteId,
				websiteId: reassignedAnonymousWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.events
				(id, client_id, event_name, anonymous_id, time, session_id, url, path, ip, user_agent, properties, created_at, profile_id)
			VALUES
				(toUUID({oldEntryId:String}), {websiteId:String}, 'screen_view', 'repeat-browser', toDateTime64('2026-01-01 10:00:00', 3), 'repeat-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-01 10:00:00', 3), ''),
				(toUUID({matchedEntryId:String}), {websiteId:String}, 'screen_view', 'repeat-browser', toDateTime64('2026-01-10 10:00:00', 3), 'repeat-session', 'https://example.test/start', '/start', '', '', '{}', toDateTime64('2026-01-10 10:00:00', 3), '')`,
			{
				matchedEntryId: randomUUIDv7(),
				oldEntryId: randomUUIDv7(),
				websiteId: repeatedEntryWebsiteId,
			}
		);
		await chCommand(
			`INSERT INTO analytics.custom_events
				(owner_id, website_id, timestamp, event_name, properties, anonymous_id, session_id, profile_id)
			VALUES
				({websiteId:String}, {websiteId:String}, toDateTime64('2026-01-10 10:01:00', 3), 'purchase', '{}', 'repeat-browser', 'repeat-session', '')`,
			{ websiteId: repeatedEntryWebsiteId }
		);
	});

	for (const [identity, websiteId] of [
		["profile-only", profileWebsiteId],
		["session-only", sessionWebsiteId],
	] as const) {
		it(`counts a ${identity} custom event as a goal completion`, async () => {
			const result = await processGoalAnalytics(
				[
					{
						name: "Purchase",
						step_number: 1,
						target: "purchase",
						type: "EVENT",
					},
				],
				[],
				queryParams(websiteId),
				1
			);

			expect(result.total_users_completed).toBe(1);
		});

		it(`joins a ${identity} custom event to its browser funnel`, async () => {
			const result = await processFunnelAnalytics(
				[
					{
						name: "Start",
						step_number: 1,
						target: "/start",
						type: "PAGE_VIEW",
					},
					{
						name: "Purchase",
						step_number: 2,
						target: "purchase",
						type: "EVENT",
					},
				],
				[],
				queryParams(websiteId)
			);

			expect(result.total_users_entered).toBe(1);
			expect(result.total_users_completed).toBe(1);
			expect(result.duration_available).toBe(false);
			expect(result.avg_completion_time).toBe(0);
			expect(result.steps_analytics[1]?.avg_time_to_complete).toBe(0);
		});
	}

	it("applies acquisition filters to the funnel cohort, not every later step", async () => {
		const result = await processFunnelAnalytics(
			[
				{
					name: "Start",
					step_number: 1,
					target: "/start",
					type: "PAGE_VIEW",
				},
				{
					name: "Purchase",
					step_number: 2,
					target: "purchase",
					type: "EVENT",
				},
			],
			[
				{ field: "path", operator: "equals", value: "/start" },
				{ field: "utm_source", operator: "equals", value: "newsletter" },
			],
			queryParams(sessionWebsiteId)
		);

		expect(result.total_users_completed).toBe(1);
	});

	it("resolves row-time identity in direct event denominators and link cohorts", async () => {
		const [totalUsers, linkVisitors] = await Promise.all([
			getTotalWebsiteUsers(
				profileWebsiteId,
				startDate,
				endDate
			),
			queryLinkVisitorIds("missing-link", queryParams(profileWebsiteId)),
		]);

		expect(totalUsers).toBe(1);
		expect(linkVisitors).toEqual(new Set());
	});

	it("keeps the cheap detector counts in parity with deep funnel counts", async () => {
		const steps = [
			{
				name: "Start",
				step_number: 1,
				target: "/start",
				type: "PAGE_VIEW" as const,
			},
			{
				name: "Purchase",
				step_number: 2,
				target: "purchase",
				type: "EVENT" as const,
			},
		];
		const [deep, cheap] = await Promise.all([
			processFunnelAnalytics(steps, [], queryParams(sessionWebsiteId)),
			processFunnelConversionCounts(steps, [], queryParams(sessionWebsiteId)),
		]);

		expect(cheap.entrants).toBe(deep.total_users_entered);
		expect(cheap.completions).toBe(deep.total_users_completed);
		expect(cheap.steps.map((step) => step.users)).toEqual(
			deep.steps_analytics.map((step) => step.users)
		);
	});

	it("attributes a conversion to the entry that actually began its matched sequence", async () => {
		const result = await processFunnelAnalytics(
			[
				{
					name: "Start",
					step_number: 1,
					target: "/start",
					type: "PAGE_VIEW",
				},
				{
					name: "Purchase",
					step_number: 2,
					target: "purchase",
					type: "EVENT",
				},
			],
			[],
			{
				endDate: "2026-01-11 23:59:59",
				startDate,
				websiteId: repeatedEntryWebsiteId,
			}
		);

		expect(result.total_users_entered).toBe(1);
		expect(result.total_users_completed).toBe(1);
		expect(result.time_series).toEqual([
			{
				avg_time: 0,
				conversion_rate: 100,
				conversions: 1,
				date: "2026-01-10",
				dropoffs: 0,
				users: 1,
			},
		]);
	});

	it("does not rewrite an earlier session when a browser is assigned to another profile", async () => {
		const result = await processFunnelConversionCounts(
			[
				{
					name: "Start",
					step_number: 1,
					target: "/start",
					type: "PAGE_VIEW",
				},
				{
					name: "Purchase",
					step_number: 2,
					target: "purchase",
					type: "EVENT",
				},
			],
			[],
			queryParams(reassignedAnonymousWebsiteId)
		);

		expect(result.entrants).toBe(2);
		expect(result.completions).toBe(2);
	});

	it("does not rewrite earlier funnel rows when a profile changes within the session", async () => {
		const result = await processFunnelConversionCounts(
			[
				{
					name: "Start",
					step_number: 1,
					target: "/start",
					type: "PAGE_VIEW",
				},
				{
					name: "Purchase",
					step_number: 2,
					target: "purchase",
					type: "EVENT",
				},
			],
			[],
			queryParams(changedSessionProfileWebsiteId)
		);

		expect(result.entrants).toBe(1);
		expect(result.completions).toBe(1);
	});

	for (const [name, websiteId, expected] of [
		["rejects browser context after the conversion", afterContextWebsiteId, 0],
		["does not leak context across sessions", crossSessionWebsiteId, 0],
		["accepts browser context at the exact same timestamp", sameTimeWebsiteId, 1],
	] as const) {
		it(name, async () => {
			const result = await processGoalAnalytics(
				[
					{
						name: "Purchase",
						step_number: 1,
						target: "purchase",
						type: "EVENT",
					},
				],
				[{ field: "utm_source", operator: "equals", value: "newsletter" }],
				queryParams(websiteId),
				1
			);

			expect(result.total_users_completed).toBe(expected);
		});
	}
});

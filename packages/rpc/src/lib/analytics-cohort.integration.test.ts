import { beforeAll, describe, expect, it } from "bun:test";
import { randomUUIDv7 } from "bun";
import { clickHouse } from "@databuddy/db/clickhouse";
import { analyticsCohortSchema } from "@databuddy/shared/analytics-filters";
import {
	getTotalWebsiteUsers,
	processFunnelAnalytics,
	processFunnelAnalyticsByReferrer,
	processFunnelConversionCounts,
	processGoalAnalytics,
	type AnalyticsStep,
} from "./analytics-utils";

const enabled = process.env.CLICKHOUSE_COHORT_INTEGRATION_TESTS === "true";
const suite = enabled ? describe : describe.skip;
const prefix = `cohort-${randomUUIDv7()}`;
const websiteId = `${prefix}-site`;
const otherWebsiteId = `${prefix}-other`;
const boundaryWebsiteId = `${prefix}-boundary`;
const windows = [
	{ startDate: "2026-08-22", endDate: "2026-08-28 23:59:59" },
	{ startDate: "2026-08-29", endDate: "2026-09-04 23:59:59" },
] as const;
const steps: AnalyticsStep[] = [
	{
		step_number: 1,
		name: "Project created",
		type: "EVENT",
		target: "project_created",
	},
	{
		step_number: 2,
		name: "Report delivered",
		type: "EVENT",
		target: "first_report_delivered",
	},
];
const savedFilter = { field: "country", operator: "equals", value: "US" };
function filters(browser: string) {
	return [
		savedFilter,
		...analyticsCohortSchema.parse({
			filters: [{ field: "browser_name", operator: "equals", value: browser }],
		}).filters,
	];
}
function params(window: (typeof windows)[number], site = websiteId) {
	return { ...window, websiteId: site };
}

suite("native cohort SQL against disposable ClickHouse", () => {
	beforeAll(async () => {
		// Do not trust .env or a normal integration database for this insertion suite.
		if (process.env.CLICKHOUSE_URL !== "http://127.0.0.1:18129")
			throw new Error(
				"Cohort integration inserts require the disposable loopback endpoint on port 18129"
			);
		const events: Record<string, unknown>[] = [];
		const custom: Record<string, unknown>[] = [];
		for (const site of [websiteId, otherWebsiteId])
			for (const [period, window] of windows.entries())
				for (const browser of ["Safari", "Chrome"]) {
					const completions =
						site === otherWebsiteId
							? 500
							: browser === "Chrome"
								? 80
								: period === 0
									? 100
									: 20;
					for (let i = 0; i < 550; i++) {
						// Deliberately collide anonymous/session/profile IDs across the two tenants.
						const identity = `${prefix}-${period}-${browser}-${i}`;
						const anonymous = `${identity}-anon`,
							session = `${identity}-session`,
							profile = i % 3 === 0 ? `${identity}-profile` : "";
						const country = i < 500 ? "US" : "CA";
						events.push({
							id: randomUUIDv7(),
							client_id: site,
							event_name: "screen_view",
							anonymous_id: anonymous,
							session_id: session,
							time: `${window.startDate} 11:59:00`,
							created_at: `${window.startDate} 11:59:00`,
							url: "https://example.invalid/start",
							path: "/start",
							ip: "",
							user_agent: "synthetic",
							properties: "{}",
							country,
							browser_name: browser,
							profile_id: "",
						});
						const base = {
							owner_id: site,
							website_id: site,
							properties: "{}",
							anonymous_id: anonymous,
							session_id: session,
							profile_id: profile,
						};
						if (profile)
							custom.push({
								...base,
								timestamp: `${window.startDate} 11:59:30`,
								event_name: "identify",
							});
						const entry = {
							...base,
							profile_id: "",
							timestamp: `${window.startDate} 12:00:00`,
							event_name: "project_created",
						};
						custom.push(entry);
						if (i === 0) custom.push({ ...entry });
						const valid = i < completions || i >= 500;
						const completion = {
							...base,
							anonymous_id: i % 3 === 0 || i % 3 === 1 ? null : anonymous,
							session_id: i % 3 === 0 ? null : session,
							timestamp: `${window.startDate} ${valid ? "12:01:00" : "11:58:00"}`,
							event_name: "first_report_delivered",
						};
						custom.push(completion);
						if (i === 0) custom.push({ ...completion });
					}
				}
		// Later steps must remain reachable even when their browser/country differs.
		for (const [path, browser, country, time] of [
			["/start", "Safari", "US", "12:00:00"],
			["/finish", "Chrome", "CA", "12:01:00"],
		])
			events.push({
				id: randomUUIDv7(),
				client_id: boundaryWebsiteId,
				event_name: "screen_view",
				anonymous_id: `${prefix}-boundary-anon`,
				session_id: `${prefix}-boundary-session`,
				time: `2026-08-29 ${time}`,
				created_at: `2026-08-29 ${time}`,
				url: `https://example.invalid${path}`,
				path,
				ip: "",
				user_agent: "synthetic",
				properties: "{}",
				country,
				browser_name: browser,
			});
		await clickHouse.insert({
			table: "analytics.events",
			format: "JSONEachRow",
			values: events,
		});
		await clickHouse.insert({
			table: "analytics.custom_events",
			format: "JSONEachRow",
			values: custom,
		});
	}, 30_000);

	for (const [browser, expected] of [
		["Safari", [100, 20]],
		["Chrome", [80, 80]],
	] as const)
		it(`${browser}: ordered completions and stable entrants in both exact windows`, async () => {
			for (const [period, window] of windows.entries()) {
				const result = await processFunnelAnalytics(
					steps,
					filters(browser),
					params(window)
				);
				expect(result.total_users_entered).toBe(500);
				expect(result.total_users_completed).toBe(expected[period]);
				expect(result.overall_conversion_rate).toBe(expected[period]! / 5);
				expect(result.steps_analytics.map((step) => step.users)).toEqual([
					500,
					expected[period],
				]);
				expect(
					result.time_series?.map((row) => [
						row.date,
						row.users,
						row.conversions,
					])
				).toEqual([[window.startDate, 500, expected[period]]]);
			}
		}, 30_000);

	it("country filter remains ANDed with the requested browser cohort", async () => {
		const cohort = analyticsCohortSchema.parse({
			filters: [{ field: "browser_name", operator: "equals", value: "Safari" }],
		}).filters;
		const result = await processFunnelAnalytics(
			steps,
			cohort,
			params(windows[1])
		);
		expect(result.total_users_entered).toBe(550);
		expect(result.total_users_completed).toBe(70);
	});
	it("other tenant's colliding identities and completions cannot inflate this tenant", async () => {
		const other = await processFunnelAnalytics(
			steps,
			filters("Safari"),
			params(windows[1], otherWebsiteId)
		);
		const original = await processFunnelAnalytics(
			steps,
			filters("Safari"),
			params(windows[1])
		);
		expect([other.total_users_entered, other.total_users_completed]).toEqual([
			500, 500,
		]);
		expect([
			original.total_users_entered,
			original.total_users_completed,
		]).toEqual([500, 20]);
	});
	it("filters the entry context without filtering a later step's changed context", async () => {
		const pages: AnalyticsStep[] = [
			{ step_number: 1, name: "Start", target: "/start", type: "PAGE_VIEW" },
			{ step_number: 2, name: "Finish", target: "/finish", type: "PAGE_VIEW" },
		];
		const result = await processFunnelAnalytics(
			pages,
			filters("Safari"),
			params(windows[1], boundaryWebsiteId)
		);
		expect([result.total_users_entered, result.total_users_completed]).toEqual([
			1, 1,
		]);
		const chrome = await processFunnelAnalytics(
			pages,
			filters("Chrome"),
			params(windows[1], boundaryWebsiteId)
		);
		expect([chrome.total_users_entered, chrome.total_users_completed]).toEqual([
			0, 0,
		]);
	});
	it("supports union and exclusion cohort selectors without changing the denominator", async () => {
		const union = await processFunnelAnalytics(steps, [savedFilter, {field:"browser_name",operator:"in",value:["Safari","Chrome"]}], params(windows[1]));
		expect([union.total_users_entered,union.total_users_completed]).toEqual([1000,100]);
		const excluded = await processFunnelAnalytics(steps, [savedFilter, {field:"browser_name",operator:"not_in",value:["Safari"]}], params(windows[1]));
		expect([excluded.total_users_entered,excluded.total_users_completed]).toEqual([500,80]);
	});
	it("native referrer analytics respects the same entry browser and saved filters", async () => {
		const result = await processFunnelAnalyticsByReferrer(steps, filters("Safari"), params(windows[1]));
		expect(result.referrer_analytics.map(row=>[row.total_users,row.completed_users])).toEqual([[500,20]]);
	});
	it("deep and detector counts agree for the exact cohort", async () => {
		const result = await processFunnelConversionCounts(
			steps,
			filters("Safari"),
			params(windows[1])
		);
		expect([result.entrants, result.completions, result.rate]).toEqual([
			500, 20, 4,
		]);
	});
	it("goal cohort counts use matching page-view visitors and contextual completions", async () => {
		const window = windows[1];
		const entrants = await getTotalWebsiteUsers(
			websiteId,
			window.startDate,
			"2026-09-04",
			filters("Safari")
		);
		const result = await processGoalAnalytics(
			[{ ...steps[1]!, step_number: 1 }],
			filters("Safari"),
			params(window),
			entrants
		);
		expect([result.total_users_entered, result.total_users_completed]).toEqual([
			500, 20,
		]);
	});
});

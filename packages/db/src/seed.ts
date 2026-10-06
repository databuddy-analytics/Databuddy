import type { ClickHouseClient } from "@clickhouse/client";
import { en, Faker } from "@faker-js/faker";
import { TABLE_NAMES } from "./clickhouse/client";

const EVENTS_PER_SESSION = 6;
const DAY_MS = 86_400_000;
const SESSION_WINDOW_MS = DAY_MS - 3_600_000;
const ANOMALY_TRAFFIC_MULTIPLIER = 3;
const ANOMALY_ERROR_MULTIPLIER = 4;
const ANOMALY_ERROR_DAYS = 7;
const ERRORS_PER_SESSION = 0.05;
const WEEKEND_TRAFFIC = 0.7;

const PATHS = [
	"/",
	"/pricing",
	"/features",
	"/docs",
	"/blog",
	"/about",
	"/signup",
	"/dashboard",
];
const REFERRERS = [
	null,
	null,
	"https://google.com",
	"https://github.com",
	"https://twitter.com",
];
const COUNTRIES = ["US", "US", "DE", "GB", "FR", "CA", "IN", "BR"];
const BROWSERS = ["Chrome", "Chrome", "Safari", "Firefox", "Edge"];
const OPERATING_SYSTEMS = ["macOS", "Windows", "iOS", "Android", "Linux"];
const DEVICES = ["desktop", "desktop", "mobile", "tablet"];
const ERROR_TYPES = ["Error", "TypeError", "ReferenceError"];
const ERROR_MESSAGES = [
	"Cannot read properties of undefined (reading 'id')",
	"Failed to fetch",
	"Unexpected token in JSON",
];
const VITALS = [
	{ max: 4000, min: 800, name: "LCP" },
	{ max: 2500, min: 300, name: "FCP" },
	{ max: 400, min: 40, name: "INP" },
	{ max: 800, min: 50, name: "TTFB" },
	{ max: 0.3, min: 0, name: "CLS" },
];

function clickHouseTime(ms: number): string {
	return new Date(ms).toISOString().replace("T", " ").replace("Z", "");
}

export function generateAnalytics({
	anomaly = false,
	clientId,
	days = 28,
	domain,
	events: eventCount = days * 150 * EVENTS_PER_SESSION,
}: {
	anomaly?: boolean;
	clientId: string;
	days?: number;
	domain: string;
	events?: number;
}) {
	const faker = new Faker({ locale: [en], seed: 42 });
	const dailySessions = Math.ceil(eventCount / days / EVENTS_PER_SESSION);
	const now = Date.now();
	const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
	const visitors = Array.from({ length: dailySessions * 4 }, () => ({
		anonymousId: `anon_${faker.string.uuid()}`,
		browser: faker.helpers.arrayElement(BROWSERS),
		country: faker.helpers.arrayElement(COUNTRIES),
		device: faker.helpers.arrayElement(DEVICES),
		os: faker.helpers.arrayElement(OPERATING_SYSTEMS),
	}));

	const dailyTraffic = Array.from({ length: days }, (_, index) => {
		const daysAgo = days - index;
		const dayStart = todayStart - daysAgo * DAY_MS;
		const weekday = new Date(dayStart).getUTCDay();
		const traffic =
			(weekday === 0 || weekday === 6 ? WEEKEND_TRAFFIC : 1) *
			faker.number.float({ max: 1.1, min: 0.9 }) *
			(anomaly && daysAgo === 1 ? ANOMALY_TRAFFIC_MULTIPLIER : 1);
		const sessions = Array.from(
			{ length: Math.round(dailySessions * traffic) },
			() => ({
				pages: Array.from(
					{ length: faker.number.int({ max: 5, min: 1 }) },
					() => ({
						path: faker.helpers.arrayElement(PATHS),
						seconds: faker.number.int({ max: 180, min: 3 }),
					})
				),
				referrer: faker.helpers.arrayElement(REFERRERS),
				sessionId: `sess_${faker.string.uuid()}`,
				start: dayStart + faker.number.int({ max: SESSION_WINDOW_MS, min: 0 }),
				visitor: faker.helpers.arrayElement(visitors),
			})
		);
		const errorMultiplier =
			anomaly && daysAgo <= ANOMALY_ERROR_DAYS ? ANOMALY_ERROR_MULTIPLIER : 1;
		return {
			errorCount: Math.round(
				sessions.length * ERRORS_PER_SESSION * errorMultiplier
			),
			sessions,
		};
	});
	const sessions = dailyTraffic.flatMap((day) => day.sessions);

	const events = sessions.flatMap((session) => {
		let time = session.start;
		return session.pages.flatMap((page, index) => {
			const viewedAt = time;
			time += (page.seconds + 1) * 1000;
			const shared = {
				anonymous_id: session.visitor.anonymousId,
				browser_name: session.visitor.browser,
				client_id: clientId,
				country: session.visitor.country,
				created_at: clickHouseTime(now),
				device_type: session.visitor.device,
				ip: "",
				os_name: session.visitor.os,
				path: page.path,
				properties: "{}",
				referrer: index === 0 ? session.referrer : null,
				session_id: session.sessionId,
				title: page.path === "/" ? "Home" : page.path.slice(1),
				url: `https://${domain}${page.path}`,
				user_agent: "",
			};
			return [
				{
					...shared,
					event_name: "screen_view",
					id: faker.string.uuid(),
					time: clickHouseTime(viewedAt),
				},
				{
					...shared,
					event_name: "page_exit",
					id: faker.string.uuid(),
					interaction_count: faker.number.int({ max: 20, min: 0 }),
					scroll_depth: faker.number.int({ max: 100, min: 10 }),
					time: clickHouseTime(viewedAt + page.seconds * 1000),
					time_on_page: page.seconds,
				},
			];
		});
	});

	const webVitals = sessions.flatMap((session) =>
		VITALS.map((vital) => ({
			anonymous_id: session.visitor.anonymousId,
			client_id: clientId,
			metric_name: vital.name,
			metric_value: faker.number.float({
				fractionDigits: 3,
				max: vital.max,
				min: vital.min,
			}),
			path: session.pages[0]?.path ?? "/",
			session_id: session.sessionId,
			timestamp: clickHouseTime(session.start + 1000),
		}))
	);

	const outgoingLinks = sessions
		.filter(() => faker.datatype.boolean({ probability: 0.1 }))
		.map((session) => ({
			anonymous_id: session.visitor.anonymousId,
			client_id: clientId,
			href: "https://github.com/databuddy-analytics/Databuddy",
			id: faker.string.uuid(),
			properties: "{}",
			session_id: session.sessionId,
			text: "Databuddy GitHub",
			timestamp: clickHouseTime(session.start + 5000),
		}));

	const errors = dailyTraffic.flatMap((day) =>
		Array.from({ length: day.errorCount }, () => {
			const session = faker.helpers.arrayElement(day.sessions);
			const errorType = faker.helpers.arrayElement(ERROR_TYPES);
			return {
				anonymous_id: session.visitor.anonymousId,
				client_id: clientId,
				colno: faker.number.int({ max: 80, min: 1 }),
				error_type: errorType,
				filename: `https://${domain}/_next/static/chunks/app.js`,
				lineno: faker.number.int({ max: 900, min: 1 }),
				message: faker.helpers.arrayElement(ERROR_MESSAGES),
				path: faker.helpers.arrayElement(PATHS),
				session_id: session.sessionId,
				stack: `${errorType}\n    at app.js`,
				timestamp: clickHouseTime(session.start + 2000),
			};
		})
	);

	return { errors, events, outgoingLinks, webVitals };
}

export async function seedAnalytics(
	client: ClickHouseClient,
	rows: ReturnType<typeof generateAnalytics>
): Promise<void> {
	await Promise.all(
		(
			[
				[TABLE_NAMES.events, rows.events],
				[TABLE_NAMES.outgoing_links, rows.outgoingLinks],
				[TABLE_NAMES.error_spans, rows.errors],
				[TABLE_NAMES.web_vitals_spans, rows.webVitals],
			] as const
		).map(([table, values]) =>
			client.insert<unknown>({ format: "JSONEachRow", table, values })
		)
	);
}

export async function deleteAnalytics(
	client: ClickHouseClient,
	clientId: string
): Promise<void> {
	for (const table of [
		TABLE_NAMES.events,
		"analytics.daily_pageviews",
		TABLE_NAMES.outgoing_links,
		TABLE_NAMES.error_spans,
		TABLE_NAMES.web_vitals_spans,
	]) {
		await client.command({
			clickhouse_settings: { lightweight_deletes_sync: "1" },
			query: `DELETE FROM ${table} WHERE client_id = {clientId:String}`,
			query_params: { clientId },
		});
	}
}

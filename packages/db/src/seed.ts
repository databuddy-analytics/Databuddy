import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { clickHouse, TABLE_NAMES } from "./clickhouse/client";
import { db } from "./client";
import { websites } from "./drizzle/schema";

const clientId = process.argv[2] || faker.string.uuid();
const eventCount = Number(process.argv[3]) || 10_000;

const PATHS = [
	"/",
	"/home",
	"/pricing",
	"/features",
	"/docs",
	"/login",
	"/signup",
	"/dashboard",
	"/settings",
	"/profile",
	"/blog",
	"/about",
	"/contact",
];

const REFERRERS = [
	"direct",
	"https://google.com",
	"https://facebook.com",
	"https://twitter.com",
	"https://github.com",
];

const UNIQUE_USERS = Math.max(10, Math.floor(eventCount / 8));
const TOTAL_SESSIONS = Math.floor(UNIQUE_USERS * 2.5);

const USER_POOL = Array.from({ length: UNIQUE_USERS }, () => ({
	anonymousId: `anon_${faker.string.uuid()}`,
	country: faker.location.countryCode(),
	region: faker.location.state(),
	city: faker.location.city(),
	timezone: faker.helpers.arrayElement([
		"America/New_York",
		"Europe/London",
		"Asia/Tokyo",
	]),
	language: faker.helpers.arrayElement(["en-US", "en-GB", "fr-FR", "de-DE"]),
	deviceType: faker.helpers.arrayElement(["desktop", "mobile", "tablet"]),
	browser: faker.helpers.arrayElement(["Chrome", "Firefox", "Safari", "Edge"]),
	os: faker.helpers.arrayElement([
		"Windows",
		"macOS",
		"Linux",
		"Android",
		"iOS",
	]),
	viewportSize: `${faker.number.int({ min: 800, max: 1920 })}x${faker.number.int({ min: 600, max: 1080 })}`,
}));

const SESSION_POOL = Array.from({ length: TOTAL_SESSIONS }, () => {
	const user = faker.helpers.arrayElement(USER_POOL);
	return {
		sessionId: `sess_${faker.string.uuid()}`,
		anonymousId: user.anonymousId,
		sessionStartTime: faker.date.recent({ days: 30 }).getTime(),
		user,
		referrer: faker.helpers.arrayElement(REFERRERS),
	};
});

function generatePageTitle(path: string): string {
	if (path === "/") {
		return "Home";
	}
	const name = path.slice(1).replace(/-/g, " ");
	return name.charAt(0).toUpperCase() + name.slice(1) || "Page";
}

(async () => {
	const website = await db.query.websites.findFirst({
		where: eq(websites.id, clientId),
		columns: { domain: true },
	});

	const domain = website?.domain || "example.com";

	const events = Array.from({ length: eventCount }, (_, index) => {
		const sessionIndex = Math.floor(index / (eventCount / TOTAL_SESSIONS));
		const session =
			SESSION_POOL[Math.min(sessionIndex, SESSION_POOL.length - 1)];
		const user = session.user;

		const maxSessionDuration = 2 * 60 * 60 * 1000;
		const sessionProgress =
			(index % Math.ceil(eventCount / TOTAL_SESSIONS)) /
			Math.ceil(eventCount / TOTAL_SESSIONS);
		const baseTime =
			session.sessionStartTime + sessionProgress * maxSessionDuration;

		const path = faker.helpers.arrayElement(PATHS);
		const isLastEvent =
			sessionProgress > 0.8 || faker.datatype.boolean({ probability: 0.2 });
		const eventName =
			isLastEvent && faker.datatype.boolean({ probability: 0.8 })
				? "page_exit"
				: "screen_view";
		const isPageExit = eventName === "page_exit";
		const fullUrl = `https://${domain}${path}`;

		return {
			id: faker.string.uuid(),
			client_id: clientId,
			event_name: eventName,
			anonymous_id: session.anonymousId,
			time: baseTime,
			session_id: session.sessionId,
			event_type: "track",
			event_id: faker.string.uuid(),
			session_start_time: session.sessionStartTime,
			timestamp: baseTime,
			referrer: session.referrer === "direct" ? undefined : session.referrer,
			url: fullUrl,
			path: fullUrl,
			title: generatePageTitle(path),
			ip: faker.internet.ip(),
			user_agent: "",
			browser_name: user.browser,
			browser_version: faker.system.semver(),
			os_name: user.os,
			os_version: faker.system.semver(),
			device_type: user.deviceType,
			device_brand:
				user.deviceType === "mobile"
					? faker.helpers.arrayElement(["Apple", "Samsung", "Google"])
					: undefined,
			device_model:
				user.deviceType === "mobile" ? faker.phone.imei() : undefined,
			country: user.country,
			region: user.region,
			city: user.city,
			screen_resolution: undefined,
			viewport_size: user.viewportSize,
			language: user.language,
			timezone: user.timezone,
			connection_type: undefined,
			rtt: undefined,
			downlink: undefined,
			time_on_page: isPageExit
				? Math.round(
					faker.number.float({ min: 5, max: 600, fractionDigits: 1 })
				)
				: undefined,
			scroll_depth: isPageExit
				? faker.number.float({ min: 10, max: 100, fractionDigits: 1 })
				: undefined,
			interaction_count: isPageExit
				? faker.number.int({ min: 0, max: 50 })
				: undefined,
			page_count:
				eventName === "screen_view" || isPageExit
					? faker.number.int({ min: 1, max: 10 })
					: 1,
			utm_source: faker.helpers.maybe(
				() => faker.helpers.arrayElement(["google", "facebook", "twitter"]),
				{ probability: 0.3 }
			),
			utm_medium: faker.helpers.maybe(
				() => faker.helpers.arrayElement(["cpc", "organic", "social"]),
				{ probability: 0.3 }
			),
			utm_campaign: faker.helpers.maybe(() => faker.lorem.slug(), {
				probability: 0.2,
			}),
			utm_term: faker.helpers.maybe(() => faker.lorem.word(), {
				probability: 0.15,
			}),
			utm_content: faker.helpers.maybe(
				() => faker.lorem.words({ min: 1, max: 3 }),
				{ probability: 0.15 }
			),
			load_time: undefined,
			dom_ready_time: undefined,
			dom_interactive: undefined,
			ttfb: undefined,
			connection_time: undefined,
			request_time: undefined,
			render_time: undefined,
			redirect_time: undefined,
			domain_lookup_time: undefined,
			properties: "{}",
			created_at: Date.now(),
		};
	});

	events.sort((a, b) => a.time - b.time);

	const outgoingLinks = Array.from(
		{ length: Math.floor(eventCount / 10) },
		(_, index) => {
			const sessionIndex = Math.floor(
				index / (Math.floor(eventCount / 10) / TOTAL_SESSIONS)
			);
			const session =
				SESSION_POOL[Math.min(sessionIndex, SESSION_POOL.length - 1)];

			const maxSessionDuration = 2 * 60 * 60 * 1000;
			const sessionProgress =
				(index % Math.ceil(Math.floor(eventCount / 10) / TOTAL_SESSIONS)) /
				Math.ceil(Math.floor(eventCount / 10) / TOTAL_SESSIONS);
			const timestamp =
				session.sessionStartTime + sessionProgress * maxSessionDuration;

			return {
				id: faker.string.uuid(),
				client_id: clientId,
				anonymous_id: session.anonymousId,
				session_id: session.sessionId,
				href: faker.internet.url(),
				text: faker.helpers.maybe(() => faker.lorem.words({ min: 1, max: 4 }), {
					probability: 0.7,
				}),
				properties: "{}",
				timestamp,
			};
		}
	);

	outgoingLinks.sort((a, b) => a.timestamp - b.timestamp);

	const errors = Array.from(
		{ length: Math.floor(eventCount / 20) },
		(_, index) => {
			const sessionIndex = Math.floor(
				index / (Math.floor(eventCount / 20) / TOTAL_SESSIONS)
			);
			const session =
				SESSION_POOL[Math.min(sessionIndex, SESSION_POOL.length - 1)];

			const maxSessionDuration = 2 * 60 * 60 * 1000;
			const sessionProgress =
				(index % Math.ceil(Math.floor(eventCount / 20) / TOTAL_SESSIONS)) /
				Math.ceil(Math.floor(eventCount / 20) / TOTAL_SESSIONS);
			const timestamp =
				session.sessionStartTime + sessionProgress * maxSessionDuration;
			const pathname = faker.helpers.arrayElement(PATHS);
			const errorType = faker.helpers.arrayElement([
				"Error",
				"TypeError",
				"ReferenceError",
				"UnhandledRejection",
			]);

			return {
				client_id: clientId,
				anonymous_id: session.anonymousId,
				session_id: session.sessionId,
				timestamp,
				path: pathname,
				message: faker.helpers.arrayElement([
					"Cannot read property 'x' of undefined",
					"Unexpected token in JSON",
					"Network request failed",
					"Maximum call stack size exceeded",
					"Failed to fetch",
				]),
				filename: faker.helpers.maybe(
					() => `https://${domain}${pathname}/app.js`,
					{ probability: 0.8 }
				),
				lineno: faker.helpers.maybe(
					() => faker.number.int({ min: 1, max: 1000 }),
					{ probability: 0.7 }
				),
				colno: faker.helpers.maybe(
					() => faker.number.int({ min: 1, max: 100 }),
					{ probability: 0.6 }
				),
				stack: faker.helpers.maybe(
					() =>
						`Error: ${errorType}\n    at function (app.js:${faker.number.int({ min: 1, max: 100 })}:${faker.number.int({ min: 1, max: 50 })})`,
					{ probability: 0.8 }
				),
				error_type: errorType,
			};
		}
	);

	errors.sort((a, b) => a.timestamp - b.timestamp);

	const webVitals = Array.from(
		{ length: Math.floor(eventCount / 5) },
		(_, index) => {
			const sessionIndex = Math.floor(
				index / (Math.floor(eventCount / 5) / TOTAL_SESSIONS)
			);
			const session =
				SESSION_POOL[Math.min(sessionIndex, SESSION_POOL.length - 1)];

			const maxSessionDuration = 2 * 60 * 60 * 1000;
			const sessionProgress =
				(index % Math.ceil(Math.floor(eventCount / 5) / TOTAL_SESSIONS)) /
				Math.ceil(Math.floor(eventCount / 5) / TOTAL_SESSIONS);
			const timestamp =
				session.sessionStartTime + sessionProgress * maxSessionDuration;
			const pathname = faker.helpers.arrayElement(PATHS);
			const metricName = faker.helpers.arrayElement([
				"FCP",
				"LCP",
				"CLS",
				"INP",
				"TTFB",
				"FPS",
			]);

			let metricValue: number;
			if (metricName === "CLS") {
				metricValue = faker.number.float({
					min: 0,
					max: 0.5,
					fractionDigits: 3,
				});
			} else if (metricName === "FPS") {
				metricValue = faker.number.int({ min: 30, max: 60 });
			} else {
				metricValue = faker.number.int({ min: 100, max: 5000 });
			}

			return {
				client_id: clientId,
				anonymous_id: session.anonymousId,
				session_id: session.sessionId,
				timestamp,
				path: pathname,
				metric_name: metricName,
				metric_value: metricValue,
			};
		}
	);

	webVitals.sort((a, b) => a.timestamp - b.timestamp);

	console.log(
		`Generating seed data for client: ${clientId} on domain: ${domain}`
	);
	console.log(
		`Creating ${UNIQUE_USERS} users across ${TOTAL_SESSIONS} sessions`
	);

	await Promise.all([
		clickHouse.insert({
			table: TABLE_NAMES.events,
			format: "JSONEachRow",
			values: events,
		}),
		clickHouse.insert({
			table: "analytics.outgoing_links",
			format: "JSONEachRow",
			values: outgoingLinks,
		}),
		clickHouse.insert({
			table: "analytics.error_spans",
			format: "JSONEachRow",
			values: errors,
		}),
		clickHouse.insert({
			table: "analytics.web_vitals_spans",
			format: "JSONEachRow",
			values: webVitals,
		}),
	]);

	console.log(
		`Inserted ${events.length} events, ${outgoingLinks.length} outgoing links, ${errors.length} errors, ${webVitals.length} web vitals for client ${clientId}`
	);
})();

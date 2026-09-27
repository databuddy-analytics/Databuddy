import {
	endOfLocalDay,
	type ImportContext,
	type ImportProvider,
	type ImportRecord,
	type ImportSource,
	isSameSite,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
} from "../pipeline";

const PAGEVIEW_EVENT = "$pageview";
const MIN_EXIT_SECONDS = 1;
const MAX_EXIT_SECONDS = 30 * 60;
const SESSION_GAP_MS = 30 * 60 * 1000;
const DETECT_SAMPLE_EVENTS = 20;

type JsonObject = Record<string, unknown>;

interface Pageview {
	browserName: string | null;
	country: string | null;
	deviceType: string | null;
	hostname?: string;
	osName: string | null;
	path: string;
	referrer: string | null;
	sessionId: string | null;
	timeMs: number;
	visitorKey: string;
}

interface OpenPage {
	at: number;
	hostname?: string;
	path: string;
	visitorKey: string;
}

interface VisitorSession {
	key: string;
	lastMs: number;
}

function asObject(value: unknown): JsonObject | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonObject)
		: null;
}

function parseJsonObject(line: string): JsonObject | null {
	try {
		return asObject(JSON.parse(line));
	} catch {
		return null;
	}
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function* jsonLines(body: string): Generator<JsonObject> {
	for (const line of body.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) {
			continue;
		}
		const parsed = parseJsonObject(trimmed);
		if (parsed) {
			yield parsed;
		}
	}
}

async function* jsonObjects(source: ImportSource): AsyncGenerator<JsonObject> {
	if (source.kind === "file") {
		yield* jsonLines(await source.text());
		return;
	}
	for await (const entry of source.entries()) {
		if (entry.name.endsWith(".parquet")) {
			continue;
		}
		yield* jsonLines(await entry.text());
	}
}

function propertiesOf(event: JsonObject): JsonObject {
	const raw = event.properties;
	return (typeof raw === "string" ? parseJsonObject(raw) : asObject(raw)) ?? {};
}

function pathAndHostname(properties: JsonObject): {
	hostname?: string;
	path: string;
} {
	const url = text(properties.$current_url);
	if (url && URL.canParse(url)) {
		const parsed = new URL(url);
		return { hostname: parsed.hostname, path: parsed.pathname };
	}
	return { path: text(properties.$pathname) ?? "/" };
}

function isPosthogEvent(event: JsonObject): boolean {
	return Boolean(
		text(event.event) &&
			text(event.timestamp) &&
			(text(event.distinct_id) || text(event.person_id))
	);
}

function toPageview(
	event: JsonObject,
	context: ImportContext
): Pageview | null {
	if (text(event.event) !== PAGEVIEW_EVENT) {
		return null;
	}
	const timeMs = Date.parse(text(event.timestamp) ?? "");
	if (!Number.isFinite(timeMs)) {
		return null;
	}

	const properties = propertiesOf(event);
	const { path, hostname } = pathAndHostname(properties);
	if (!isSameSite(hostname, context.domain)) {
		return null;
	}

	return {
		browserName: text(properties.$browser),
		country: text(properties.$geoip_country_code),
		deviceType: text(properties.$device_type)?.toLowerCase() ?? null,
		hostname,
		osName: text(properties.$os),
		path,
		referrer: text(properties.$referrer),
		sessionId: text(properties.$session_id),
		timeMs,
		visitorKey:
			text(event.person_id) ??
			text(event.distinct_id) ??
			`${context.websiteId}:anon`,
	};
}

function sessionKeyFor(
	pageview: Pageview,
	visitors: Map<string, VisitorSession>
): string {
	if (pageview.sessionId) {
		return `${pageview.visitorKey}:${pageview.sessionId}`;
	}
	const current = visitors.get(pageview.visitorKey);
	if (current && pageview.timeMs - current.lastMs <= SESSION_GAP_MS) {
		current.lastMs = pageview.timeMs;
		return current.key;
	}
	const key = `${pageview.visitorKey}:g${pageview.timeMs}`;
	visitors.set(pageview.visitorKey, { key, lastMs: pageview.timeMs });
	return key;
}

function exitRecord(
	page: OpenPage,
	sessionKey: string,
	elapsedMs: number,
	timezone: string
): ImportRecord {
	const seconds = Math.min(
		MAX_EXIT_SECONDS,
		Math.max(MIN_EXIT_SECONDS, Math.round(elapsedMs / 1000))
	);
	const dayEnd = endOfLocalDay(new Date(page.at), timezone).getTime();

	return {
		grain: "event",
		time: new Date(Math.min(page.at + seconds * 1000, dayEnd)),
		eventName: PAGE_EXIT_EVENT_NAME,
		path: page.path,
		hostname: page.hostname,
		visitorKey: page.visitorKey,
		sessionKey,
		timeOnPage: seconds,
	};
}

export const posthogProvider: ImportProvider = {
	id: "posthog",
	label: "PostHog",
	grain: "event",

	async detect(source) {
		let checked = 0;
		for await (const event of jsonObjects(source)) {
			if (isPosthogEvent(event)) {
				return true;
			}
			checked += 1;
			if (checked >= DETECT_SAMPLE_EVENTS) {
				break;
			}
		}
		return false;
	},

	async *parse(source, context) {
		const pageviews: Pageview[] = [];
		for await (const event of jsonObjects(source)) {
			const pageview = toPageview(event, context);
			if (pageview) {
				pageviews.push(pageview);
			}
		}
		pageviews.sort((a, b) => a.timeMs - b.timeMs);

		const visitors = new Map<string, VisitorSession>();
		const open = new Map<string, OpenPage>();

		for (const pageview of pageviews) {
			const sessionKey = sessionKeyFor(pageview, visitors);
			const previous = open.get(sessionKey);
			if (previous) {
				yield exitRecord(
					previous,
					sessionKey,
					pageview.timeMs - previous.at,
					context.timezone
				);
			}
			open.set(sessionKey, {
				at: pageview.timeMs,
				hostname: pageview.hostname,
				path: pageview.path,
				visitorKey: pageview.visitorKey,
			});

			yield {
				grain: "event",
				time: new Date(pageview.timeMs),
				eventName: PAGEVIEW_EVENT_NAME,
				path: pageview.path,
				hostname: pageview.hostname,
				visitorKey: pageview.visitorKey,
				sessionKey,
				referrer: pageview.referrer,
				country: pageview.country,
				deviceType: pageview.deviceType,
				browserName: pageview.browserName,
				osName: pageview.osName,
			};
		}

		for (const [sessionKey, last] of open) {
			yield exitRecord(
				last,
				sessionKey,
				MIN_EXIT_SECONDS * 1000,
				context.timezone
			);
		}
	},
};

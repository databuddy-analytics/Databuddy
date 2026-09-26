import {
	type ImportProvider,
	type ImportSource,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
} from "../pipeline";

const PAGEVIEW_EVENT = "$pageview";
const MIN_EXIT_SECONDS = 1;
const DETECT_SAMPLE_LINES = 20;

interface PosthogProperties {
	$browser?: string;
	$current_url?: string;
	$device_type?: string;
	$geoip_country_code?: string;
	$os?: string;
	$pathname?: string;
	$referrer?: string;
	$session_id?: string;
}

interface PosthogEvent {
	distinct_id?: string;
	event?: string;
	person_id?: string;
	properties?: PosthogProperties | string;
	timestamp?: string;
}

interface Visit {
	firstMs: number;
	hostname?: string;
	key: string;
	lastMs: number;
	path: string;
	visitorKey: string;
}

function parseJsonLines(text: string): PosthogEvent[] {
	const events: PosthogEvent[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) {
			continue;
		}
		try {
			events.push(JSON.parse(trimmed) as PosthogEvent);
		} catch {}
	}
	return events;
}

function propertiesOf(event: PosthogEvent): PosthogProperties {
	const raw = event.properties;
	if (!raw) {
		return {};
	}
	if (typeof raw !== "string") {
		return raw;
	}
	try {
		return JSON.parse(raw) as PosthogProperties;
	} catch {
		return {};
	}
}

function pathAndHostname(properties: PosthogProperties): {
	hostname?: string;
	path: string;
} {
	if (properties.$current_url) {
		try {
			const url = new URL(properties.$current_url);
			return { hostname: url.hostname, path: url.pathname };
		} catch {
			// fall through to $pathname
		}
	}
	return { path: properties.$pathname || "/" };
}

async function sourceTexts(source: ImportSource): Promise<string[]> {
	if (source.kind === "file") {
		return [await source.text()];
	}
	const texts: string[] = [];
	for await (const entry of source.entries()) {
		if (entry.name.endsWith(".parquet")) {
			continue;
		}
		texts.push(await entry.text());
	}
	return texts;
}

function looksLikePosthogExport(text: string): boolean {
	for (const event of parseJsonLines(text).slice(0, DETECT_SAMPLE_LINES)) {
		if (
			event.event &&
			event.timestamp &&
			(event.distinct_id || event.person_id)
		) {
			return true;
		}
	}
	return false;
}

export const posthogProvider: ImportProvider = {
	id: "posthog",
	label: "PostHog",
	grain: "event",

	async detect(source) {
		const texts = await sourceTexts(source);
		return texts.some(looksLikePosthogExport);
	},

	async *parse(source, context) {
		const texts = await sourceTexts(source);
		const rows = texts
			.flatMap(parseJsonLines)
			.filter((event) => event.event === PAGEVIEW_EVENT)
			.map((event) => ({
				event,
				properties: propertiesOf(event),
				timeMs: Date.parse(event.timestamp ?? ""),
			}))
			.filter(({ timeMs }) => Number.isFinite(timeMs))
			.sort((a, b) => a.timeMs - b.timeMs);

		const visits = new Map<string, Visit>();
		let fallback = 0;

		for (const { event, properties, timeMs } of rows) {
			const visitorKey =
				event.person_id || event.distinct_id || `${context.websiteId}:anon`;
			let key = properties.$session_id;
			if (!key) {
				fallback += 1;
				key = `${visitorKey}:${fallback}`;
			}
			const { path, hostname } = pathAndHostname(properties);

			const visit = visits.get(key);
			if (visit) {
				visit.lastMs = timeMs;
				visit.path = path;
				visit.hostname = hostname;
			} else {
				visits.set(key, {
					firstMs: timeMs,
					hostname,
					key,
					lastMs: timeMs,
					path,
					visitorKey,
				});
			}

			yield {
				grain: "event",
				time: new Date(timeMs),
				eventName: PAGEVIEW_EVENT_NAME,
				path,
				hostname,
				visitorKey,
				sessionKey: key,
				referrer: properties.$referrer || null,
				country: properties.$geoip_country_code || null,
				deviceType: properties.$device_type?.toLowerCase() || null,
				browserName: properties.$browser || null,
				osName: properties.$os || null,
			};
		}

		for (const visit of visits.values()) {
			yield {
				grain: "event",
				time: new Date(visit.lastMs + 1000),
				eventName: PAGE_EXIT_EVENT_NAME,
				path: visit.path,
				hostname: visit.hostname,
				visitorKey: visit.visitorKey,
				sessionKey: visit.key,
				timeOnPage: Math.max(
					MIN_EXIT_SECONDS,
					Math.round((visit.lastMs - visit.firstMs) / 1000)
				),
			};
		}
	},
};

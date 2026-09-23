import {
	csvNumber,
	type ImportedEvent,
	type ImportProvider,
	type ImportSource,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
	parseCsv,
} from "../pipeline";

const SESSION_WINDOW_MS = 30 * 60 * 1000;
const MIN_EXIT_SECONDS = 1;

interface Visit {
	durationSeconds: number;
	hostname?: string;
	key: string;
	lastSeenMs: number;
	pageviews: number;
	path: string;
}

function isTruthy(value: string | undefined): boolean {
	return value === "true" || value === "1";
}

async function sourceText(source: ImportSource): Promise<string[]> {
	if (source.kind === "file") {
		return [await source.text()];
	}
	if (source.kind === "archive") {
		const texts: string[] = [];
		for await (const entry of source.entries()) {
			if (entry.name.endsWith(".csv")) {
				texts.push(await entry.text());
			}
		}
		return texts;
	}
	return [];
}

function hasSimpleAnalyticsHeader(text: string): boolean {
	const [header] = text.split("\n", 1);
	return header.includes("added_iso") && header.includes("is_unique");
}

function findOpenVisit(open: Visit[], timeMs: number): Visit | undefined {
	for (let i = open.length - 1; i >= 0; i -= 1) {
		const candidate = open[i];
		if (timeMs - candidate.lastSeenMs <= SESSION_WINDOW_MS) {
			return candidate;
		}
		open.splice(i, 1);
	}
	return;
}

export const simpleAnalyticsProvider: ImportProvider = {
	id: "simple-analytics",
	label: "Simple Analytics",
	grain: "event",

	async detect(source) {
		const texts = await sourceText(source);
		return texts.some(hasSimpleAnalyticsHeader);
	},

	async *parse(source, context) {
		const texts = await sourceText(source);
		const rows = texts
			.filter(hasSimpleAnalyticsHeader)
			.flatMap((text) => parseCsv(text))
			.filter((row) => row.added_iso && row.path && !isTruthy(row.is_robot))
			.map((row) => ({ row, timeMs: Date.parse(row.added_iso) }))
			.filter(({ timeMs }) => Number.isFinite(timeMs))
			.sort((a, b) => a.timeMs - b.timeMs);

		const open: Visit[] = [];
		const closed: Visit[] = [];
		let counter = 0;

		for (const { row, timeMs } of rows) {
			let visit = isTruthy(row.is_unique)
				? undefined
				: findOpenVisit(open, timeMs);
			if (!visit) {
				visit = {
					key: `${context.websiteId}:sa:${counter}`,
					lastSeenMs: timeMs,
					pageviews: 0,
					durationSeconds: 0,
					path: row.path,
				};
				counter += 1;
				open.push(visit);
				closed.push(visit);
			}
			visit.lastSeenMs = timeMs;
			visit.pageviews += 1;
			visit.durationSeconds += csvNumber(row.duration_seconds);
			visit.path = row.path;
			visit.hostname = row.hostname || undefined;

			const event: ImportedEvent = {
				time: new Date(timeMs),
				eventName: PAGEVIEW_EVENT_NAME,
				path: row.path,
				hostname: row.hostname || undefined,
				visitorKey: visit.key,
				sessionKey: visit.key,
				referrer: row.document_referrer || null,
				country: row.country_code || null,
				deviceType: row.device_type || null,
				browserName: row.browser_name || null,
				osName: row.os_name || null,
				language: row.lang_language || null,
				utmSource: row.utm_source || null,
				utmMedium: row.utm_medium || null,
				utmCampaign: row.utm_campaign || null,
				utmTerm: row.utm_term || null,
				utmContent: row.utm_content || null,
			};
			yield { grain: "event", ...event };
		}

		for (const visit of closed) {
			yield {
				grain: "event",
				time: new Date(visit.lastSeenMs + 1000),
				eventName: PAGE_EXIT_EVENT_NAME,
				path: visit.path,
				hostname: visit.hostname,
				visitorKey: visit.key,
				sessionKey: visit.key,
				timeOnPage: Math.max(
					MIN_EXIT_SECONDS,
					Math.round(visit.durationSeconds)
				),
			};
		}
	},
};

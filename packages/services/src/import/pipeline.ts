import { createHash } from "node:crypto";
import {
	chQuery,
	clickHouse,
	EXCLUDE_IMPORTED_ROWS,
	type EventsInsert,
	IMPORTED_VISITOR_PREFIX,
	TABLE_NAMES,
} from "@databuddy/db/clickhouse";
import {
	ImportFileError,
	type ImportContext,
	type ImportedEvent,
	type ImportRecord,
	MAX_BATCH_PAGEVIEWS,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
	rollupPageviews,
	type RollupDimensionKind,
	type RollupMetric,
	timeZoneOffsetMs,
} from "@databuddy/shared/import/records";

const IMPORT_MARKER_KEY = "__import";
const IMPORT_RUN_KEY = "__import_run";

const INSERT_CHUNK_SIZE = 10_000;
const SECONDS_PER_DAY = 86_400;
const INTRA_SESSION_GAP_SECONDS = 60;
const BOUNCE_DURATION_SECONDS = 1;
const BOUNCE_DURATION_CEILING_SECONDS = 9;
const NON_BOUNCE_DURATION_FLOOR_SECONDS = 10;
const COUNTRY_CODE = /^[A-Za-z]{2}$/;

const MAXMIND_COUNTRY_NAMES: Record<string, string> = {
	AG: "Antigua and Barbuda",
	BA: "Bosnia and Herzegovina",
	BL: "Saint Barthélemy",
	BQ: "Bonaire, Sint Eustatius and Saba",
	CD: "Congo (DRC)",
	CG: "Congo Republic",
	CI: "Ivory Coast",
	CN: "China",
	CV: "Cabo Verde",
	FM: "Federated States of Micronesia",
	KN: "Saint Kitts and Nevis",
	LC: "Saint Lucia",
	MF: "Saint Martin",
	MM: "Myanmar",
	NL: "The Netherlands",
	PM: "Saint Pierre and Miquelon",
	PS: "Palestine",
	ST: "São Tomé and Príncipe",
	TC: "Turks and Caicos Islands",
	TT: "Trinidad and Tobago",
	VC: "Saint Vincent and the Grenadines",
};

const regionNames = new Intl.DisplayNames("en", { type: "region" });

interface ImportAdjustments {
	droppedVisits: number;
	durationDeltaSeconds: number;
}

export type LiveDayStarts = ReadonlyMap<string, number>;

function zonedDayStartUtc(date: string, timeZone: string): Date {
	const utcMidnight = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(utcMidnight.getTime())) {
		throw new Error(`Unparseable rollup date: ${date}`);
	}
	return new Date(
		utcMidnight.getTime() - timeZoneOffsetMs(utcMidnight, timeZone)
	);
}

export function countryName(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	if (!COUNTRY_CODE.test(value)) {
		return value;
	}
	const code = value.toUpperCase();
	return MAXMIND_COUNTRY_NAMES[code] ?? regionNames.of(code) ?? value;
}

function localDayFormatter(timeZone: string): Intl.DateTimeFormat {
	const options = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	} as const;
	try {
		return new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
	} catch {
		return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
	}
}

export function liveOverlapFilter(
	liveDayStarts: LiveDayStarts,
	timeZone: string
): (time: Date) => boolean {
	const localDay = localDayFormatter(timeZone);
	return (time) => {
		const firstLive = liveDayStarts.get(localDay.format(time));
		return firstLive !== undefined && time.getTime() >= firstLive;
	};
}

async function loadLiveDayStarts(
	websiteId: string,
	timeZone: string,
	range: { fromMs: number; toMs: number }
): Promise<LiveDayStarts> {
	const rows = await chQuery<{ day: string; first_live_ms: string }>(
		`SELECT toString(toDate(time, {timeZone:String})) AS day, toString(toUnixTimestamp64Milli(min(time))) AS first_live_ms
		FROM ${TABLE_NAMES.events}
		WHERE client_id = {websiteId:String}
			AND time >= fromUnixTimestamp64Milli({fromMs:Int64})
			AND time <= fromUnixTimestamp64Milli({toMs:Int64})
			AND ${EXCLUDE_IMPORTED_ROWS}
		GROUP BY day`,
		{ websiteId, timeZone, ...range }
	);
	return new Map(rows.map((row) => [row.day, Number(row.first_live_ms)]));
}

interface PageSlot {
	hostname?: string;
	path: string;
}

interface DimensionTotal {
	pageviews: number;
	value: string;
}

interface DateBucket {
	dimensions: Map<SynthesizedDimension, DimensionTotal[]>;
	pages: Array<PageSlot & { pageviews: number }>;
	totals: Partial<Record<RollupMetric, number>>;
}

const DIMENSION_FIELDS = {
	browser: "browserName",
	country: "country",
	device: "deviceType",
	os: "osName",
	source: "referrer",
	utm_source: "utmSource",
	utm_medium: "utmMedium",
	utm_campaign: "utmCampaign",
	utm_term: "utmTerm",
	utm_content: "utmContent",
} as const satisfies Partial<Record<RollupDimensionKind, keyof ImportedEvent>>;

type SynthesizedDimension = keyof typeof DIMENSION_FIELDS;

function isSynthesizedDimension(
	kind: RollupDimensionKind
): kind is SynthesizedDimension {
	return kind in DIMENSION_FIELDS;
}

interface PlannedSession {
	durationSeconds: number;
	isBounce: boolean;
	pageviews: number;
}

function assignDimension(
	sessions: PlannedSession[],
	totals: DimensionTotal[]
): Array<string | undefined> {
	const assigned = Array.from<string | undefined>({
		length: sessions.length,
	});
	let session = 0;
	for (const total of [...totals].sort((a, b) => b.pageviews - a.pageviews)) {
		let budget = total.pageviews;
		let planned = sessions[session];
		while (budget > 0 && planned !== undefined) {
			assigned[session] = total.value;
			budget -= planned.pageviews;
			session += 1;
			planned = sessions[session];
		}
	}
	return assigned;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function sessionShape(
	slots: number,
	requestedVisits: number,
	requestedBounces: number
) {
	const visits = clamp(Math.round(requestedVisits) || 1, 1, slots);
	let bounces = clamp(Math.round(requestedBounces) || 0, 0, visits);
	if (bounces === visits && slots > visits) {
		bounces -= 1;
	}
	return { visits, bounces, nonBounce: visits - bounces };
}

function pageSlotsForDate(bucket: DateBucket): PageSlot[] {
	const slots: PageSlot[] = [];
	for (const page of bucket.pages) {
		for (let i = 0; i < page.pageviews; i += 1) {
			slots.push({ path: page.path, hostname: page.hostname });
		}
	}
	return slots;
}

export function synthesizeDate(
	date: string,
	bucket: DateBucket,
	context: ImportContext
): { events: ImportedEvent[]; adjustments: ImportAdjustments } {
	const slots = pageSlotsForDate(bucket);
	if (slots.length === 0) {
		return {
			events: [],
			adjustments: { droppedVisits: 0, durationDeltaSeconds: 0 },
		};
	}

	const requestedVisits = Math.round(
		bucket.totals.visits ?? bucket.totals.visitors ?? 1
	);
	const { visits, bounces, nonBounce } = sessionShape(
		slots.length,
		requestedVisits,
		bucket.totals.bounces ?? 0
	);
	const visitors = clamp(
		Math.round(bucket.totals.visitors ?? visits) || 1,
		1,
		visits
	);
	const totalDuration = Math.max(
		0,
		Math.round(bucket.totals.durationSeconds ?? 0)
	);

	const sessions: PlannedSession[] = [];
	for (let i = 0; i < bounces; i += 1) {
		sessions.push({
			pageviews: 1,
			durationSeconds: BOUNCE_DURATION_SECONDS,
			isBounce: true,
		});
	}
	const remaining = slots.length - bounces;
	if (nonBounce > 0) {
		const base = Math.floor(remaining / nonBounce);
		const extra = remaining % nonBounce;
		for (let i = 0; i < nonBounce; i += 1) {
			sessions.push({
				pageviews: base + (i < extra ? 1 : 0),
				durationSeconds: 0,
				isBounce: false,
			});
		}
	}

	if (nonBounce > 0) {
		const budget = Math.max(
			0,
			totalDuration - bounces * BOUNCE_DURATION_SECONDS
		);
		const base = Math.floor(budget / nonBounce);
		let remainder = budget - base * nonBounce;
		for (const session of sessions.filter((entry) => !entry.isBounce)) {
			const extra = remainder > 0 ? 1 : 0;
			remainder -= extra;
			session.durationSeconds =
				session.pageviews === 1
					? Math.max(base + extra, NON_BOUNCE_DURATION_FLOOR_SECONDS)
					: base + extra;
		}
	} else if (bounces > 0) {
		const base = clamp(
			Math.floor(totalDuration / bounces),
			BOUNCE_DURATION_SECONDS,
			BOUNCE_DURATION_CEILING_SECONDS
		);
		let remainder =
			base < BOUNCE_DURATION_CEILING_SECONDS
				? totalDuration - base * bounces
				: 0;
		for (const session of sessions) {
			const extra = remainder > 0 ? 1 : 0;
			remainder -= extra;
			session.durationSeconds = base + extra;
		}
	}

	const adjustments: ImportAdjustments = {
		droppedVisits: Math.max(0, requestedVisits - visits),
		durationDeltaSeconds:
			sessions.reduce((total, entry) => total + entry.durationSeconds, 0) -
			totalDuration,
	};

	const sessionDimensions = new Map(
		[...bucket.dimensions].map(([kind, totals]) => [
			kind,
			assignDimension(sessions, totals),
		])
	);
	const dimensionsFor = (session: number): Partial<ImportedEvent> => {
		const fields: Partial<ImportedEvent> = {};
		for (const [kind, assigned] of sessionDimensions) {
			const value = assigned[session];
			if (value) {
				fields[DIMENSION_FIELDS[kind]] = value;
			}
		}
		return fields;
	};

	const dayStart = zonedDayStartUtc(date, context.timezone).getTime();
	const dayEnd = dayStart + SECONDS_PER_DAY * 1000 - 1;
	const longestSessionSeconds =
		(Math.max(...sessions.map((entry) => entry.pageviews)) + 1) *
		INTRA_SESSION_GAP_SECONDS;
	const spreadSeconds = Math.max(
		0,
		SECONDS_PER_DAY - Math.min(longestSessionSeconds, SECONDS_PER_DAY)
	);
	const sessionStride = Math.floor(spreadSeconds / visits) * 1000;
	const events: ImportedEvent[] = [];
	let slotIndex = 0;

	for (const [session, planned] of sessions.entries()) {
		const pageviews = planned.pageviews;
		if (pageviews <= 0) {
			continue;
		}
		const visitorKey = `${context.websiteId}:${date}:v${Math.floor((session * visitors) / visits)}`;
		const sessionKey = `${context.websiteId}:${date}:s${session}`;
		const dimensions = dimensionsFor(session);
		const sessionStart = dayStart + session * sessionStride;
		let lastSlot: PageSlot | undefined;

		for (let page = 0; page < pageviews; page += 1) {
			const slot = slots[slotIndex];
			slotIndex += 1;
			if (!slot) {
				break;
			}
			lastSlot = slot;
			events.push({
				time: new Date(
					Math.min(
						sessionStart + page * INTRA_SESSION_GAP_SECONDS * 1000,
						dayEnd
					)
				),
				eventName: PAGEVIEW_EVENT_NAME,
				path: slot.path,
				hostname: slot.hostname,
				visitorKey,
				sessionKey,
				...dimensions,
			});
		}

		const timeOnPage = planned.durationSeconds;
		if (!lastSlot || timeOnPage <= 0) {
			continue;
		}

		events.push({
			time: new Date(
				Math.min(
					sessionStart + pageviews * INTRA_SESSION_GAP_SECONDS * 1000,
					dayEnd
				)
			),
			eventName: PAGE_EXIT_EVENT_NAME,
			path: lastSlot.path,
			hostname: lastSlot.hostname,
			visitorKey,
			sessionKey,
			timeOnPage,
			...dimensions,
		});
	}

	return { events, adjustments };
}

function deterministicUuid(...parts: string[]): string {
	const digest = createHash("sha256").update(parts.join("\0")).digest("hex");
	return [
		digest.slice(0, 8),
		digest.slice(8, 12),
		digest.slice(12, 16),
		digest.slice(16, 20),
		digest.slice(20, 32),
	].join("-");
}

function importedId(prefix: string, key: string): string {
	return `${IMPORTED_VISITOR_PREFIX}${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function clickHouseDateTime(at: Date): string {
	return at.toISOString().replace("T", " ").replace("Z", "");
}

function toEventRow(
	event: ImportedEvent,
	context: ImportContext,
	providerId: string
): EventsInsert {
	const hostname = event.hostname ?? context.domain;
	const path = event.path.startsWith("/") ? event.path : `/${event.path}`;
	const time = clickHouseDateTime(event.time);

	return {
		id: deterministicUuid(
			providerId,
			context.websiteId,
			event.sessionKey,
			event.eventName,
			path,
			time
		),
		client_id: context.websiteId,
		event_name: event.eventName,
		anonymous_id: importedId("v", `${providerId}:${event.visitorKey}`),
		session_id: importedId("s", `${providerId}:${event.sessionKey}`),
		time,
		url: `https://${hostname}${path}`,
		path,
		title: null,
		ip: "",
		user_agent: "",
		referrer: event.referrer ?? null,
		browser_name: event.browserName ?? null,
		os_name: event.osName ?? null,
		device_type: event.deviceType ?? null,
		language: event.language ?? null,
		timezone: context.timezone,
		country: countryName(event.country),
		region: event.region ?? null,
		city: event.city ?? null,
		utm_source: event.utmSource ?? null,
		utm_medium: event.utmMedium ?? null,
		utm_campaign: event.utmCampaign ?? null,
		utm_term: event.utmTerm ?? null,
		utm_content: event.utmContent ?? null,
		time_on_page: event.timeOnPage ?? null,
		page_count: 1,
		profile_id: "",
		properties: JSON.stringify({
			[IMPORT_MARKER_KEY]: providerId,
			[IMPORT_RUN_KEY]: context.runId,
		}),
		created_at: clickHouseDateTime(new Date()),
	};
}

async function insertChunk(
	rows: EventsInsert[],
	providerId: string,
	runId: string
): Promise<void> {
	const token = createHash("sha256")
		.update(providerId)
		.update("\0")
		.update(runId)
		.update("\0")
		.update(rows.map((row) => row.id).join("\0"))
		.digest("hex");

	await clickHouse.insert({
		table: TABLE_NAMES.events,
		values: rows,
		format: "JSONEachRow",
		clickhouse_settings: {
			async_insert: 0,
			insert_deduplication_token: token,
		},
		query_id: `import-${providerId}-${token.slice(0, 16)}`,
	});
}

export async function deleteImportedEvents(options: {
	websiteId: string;
	providerId?: string;
	exceptRunId?: string;
}): Promise<void> {
	const { websiteId, providerId, exceptRunId } = options;
	const conditions = [
		providerId
			? `JSONExtractString(properties, '${IMPORT_MARKER_KEY}') = {providerId:String}`
			: `JSONExtractString(properties, '${IMPORT_MARKER_KEY}') != ''`,
	];
	if (exceptRunId) {
		conditions.push(
			`JSONExtractString(properties, '${IMPORT_RUN_KEY}') != {exceptRunId:String}`
		);
	}

	const filter = `client_id = {websiteId:String} AND ${conditions.join(" AND ")}`;
	const params = {
		websiteId,
		...(providerId ? { providerId } : {}),
		...(exceptRunId ? { exceptRunId } : {}),
	};
	const existing = await chQuery<{ found: number }>(
		`SELECT 1 AS found FROM ${TABLE_NAMES.events} WHERE ${filter} LIMIT 1`,
		params
	);
	if (existing.length === 0) {
		return;
	}

	await clickHouse.command({
		query: `ALTER TABLE ${TABLE_NAMES.events} DELETE WHERE ${filter}`,
		query_params: params,
		clickhouse_settings: { mutations_sync: "1" },
	});
}

export interface ImportBatch extends ImportContext {
	providerId: string;
	records: ImportRecord[];
}

function bucketRollups(records: ImportRecord[]) {
	const buckets = new Map<string, DateBucket>();
	for (const record of records) {
		if (record.grain === "event") {
			continue;
		}
		const bucket = buckets.get(record.date) ?? {
			totals: {},
			pages: [],
			dimensions: new Map<SynthesizedDimension, DimensionTotal[]>(),
		};
		if (record.dimension === null) {
			bucket.totals = { ...bucket.totals, ...record.metrics };
		} else if (record.dimension.kind === "page") {
			bucket.pages.push({
				path: record.dimension.value,
				hostname: record.dimension.hostname,
				pageviews: record.metrics.pageviews ?? 0,
			});
		} else if (isSynthesizedDimension(record.dimension.kind)) {
			const kind = record.dimension.kind;
			const totals = bucket.dimensions.get(kind) ?? [];
			totals.push({
				value:
					kind === "device"
						? record.dimension.value.toLowerCase()
						: record.dimension.value,
				pageviews: record.metrics.pageviews ?? 0,
			});
			bucket.dimensions.set(kind, totals);
		}
		buckets.set(record.date, bucket);
	}
	return buckets;
}

export async function ingestImportBatch(
	batch: ImportBatch
): Promise<{ rows: number; overlapSkipped: number }> {
	const pageviews = rollupPageviews(batch.records);
	if (pageviews > MAX_BATCH_PAGEVIEWS) {
		throw new ImportFileError(
			`This batch holds ${pageviews.toLocaleString("en-US")} pageviews, more than the ${MAX_BATCH_PAGEVIEWS.toLocaleString("en-US")} one batch can hold.`
		);
	}

	const buckets = bucketRollups(batch.records);
	const events: ImportedEvent[] = batch.records.filter(
		(record): record is Extract<ImportRecord, { grain: "event" }> =>
			record.grain === "event"
	);
	for (const [date, bucket] of buckets) {
		for (const event of synthesizeDate(date, bucket, batch).events) {
			events.push(event);
		}
	}
	if (events.length === 0) {
		return { rows: 0, overlapSkipped: 0 };
	}

	let fromMs = Number.POSITIVE_INFINITY;
	let toMs = Number.NEGATIVE_INFINITY;
	for (const event of events) {
		fromMs = Math.min(fromMs, event.time.getTime());
		toMs = Math.max(toMs, event.time.getTime());
	}
	const dayMs = SECONDS_PER_DAY * 1000;
	const liveDayStarts = await loadLiveDayStarts(
		batch.websiteId,
		batch.timezone,
		{
			fromMs: fromMs - dayMs,
			toMs: toMs + dayMs,
		}
	);
	const overlapsLiveData = liveOverlapFilter(liveDayStarts, batch.timezone);
	const rows = events
		.filter((event) => !overlapsLiveData(event.time))
		.map((event) => toEventRow(event, batch, batch.providerId));

	for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
		await insertChunk(
			rows.slice(start, start + INSERT_CHUNK_SIZE),
			batch.providerId,
			batch.runId
		);
	}

	return { rows: rows.length, overlapSkipped: events.length - rows.length };
}

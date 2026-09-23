import { createHash } from "node:crypto";
import {
	clickHouse,
	type EventsInsert,
	IMPORTED_VISITOR_PREFIX,
	TABLE_NAMES,
} from "@databuddy/db/clickhouse";

export const PAGEVIEW_EVENT_NAME = "screen_view";
export const PAGE_EXIT_EVENT_NAME = "page_exit";

const IMPORT_MARKER_KEY = "__import";
const IMPORT_RUN_KEY = "__import_run";

const INSERT_CHUNK_SIZE = 10_000;
const SECONDS_PER_DAY = 86_400;
const INTRA_SESSION_GAP_SECONDS = 60;
const BOUNCE_DURATION_SECONDS = 1;
const BOUNCE_DURATION_CEILING_SECONDS = 9;
const NON_BOUNCE_DURATION_FLOOR_SECONDS = 10;

export type ImportGrain = "event" | "rollup";

export type RollupDimensionKind =
	| "page"
	| "entry_page"
	| "exit_page"
	| "referrer"
	| "source"
	| "country"
	| "region"
	| "city"
	| "browser"
	| "os"
	| "device"
	| "utm_source"
	| "utm_medium"
	| "utm_campaign"
	| "utm_term"
	| "utm_content"
	| "custom_event";

export type RollupMetric =
	| "visitors"
	| "visits"
	| "pageviews"
	| "bounces"
	| "durationSeconds";

export interface RollupDimension {
	hostname?: string;
	kind: RollupDimensionKind;
	value: string;
}

export interface ImportedRollup {
	date: string;
	dimension: RollupDimension | null;
	metrics: Partial<Record<RollupMetric, number>>;
}

export interface ImportedEvent {
	browserName?: string | null;
	city?: string | null;
	country?: string | null;
	deviceType?: string | null;
	eventName: string;
	hostname?: string;
	language?: string | null;
	osName?: string | null;
	path: string;
	properties?: Record<string, unknown>;
	referrer?: string | null;
	region?: string | null;
	sessionKey: string;
	sourceName?: string | null;
	time: Date;
	timeOnPage?: number | null;
	utmCampaign?: string | null;
	utmContent?: string | null;
	utmMedium?: string | null;
	utmSource?: string | null;
	utmTerm?: string | null;
	visitorKey: string;
}

export type ImportRecord =
	| ({ grain: "event" } & ImportedEvent)
	| ({ grain: "rollup" } & ImportedRollup);

export interface ImportEntry {
	name: string;
	text(): Promise<string>;
}

export type ImportSource =
	| { kind: "archive"; entries(): AsyncIterable<ImportEntry> }
	| { kind: "file"; name: string; text(): Promise<string> };

export interface ImportContext {
	domain: string;
	runId: string;
	timezone: string;
	websiteId: string;
}

export interface ImportProvider {
	detect(source: ImportSource): Promise<boolean>;
	grain: ImportGrain;
	id: string;
	label: string;
	parse(
		source: ImportSource,
		context: ImportContext
	): AsyncIterable<ImportRecord>;
}

export interface ImportAdjustments {
	droppedVisits: number;
	durationDeltaSeconds: number;
}

export interface ImportResult {
	adjustments: ImportAdjustments;
	dates: number;
	rows: number;
	skippedRollups: number;
}

export function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let quoted = false;

	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];

		if (quoted) {
			if (char !== '"') {
				field += char;
				continue;
			}
			if (text[i + 1] === '"') {
				field += '"';
				i += 1;
				continue;
			}
			quoted = false;
			continue;
		}

		if (char === '"') {
			quoted = true;
			continue;
		}
		if (char === ",") {
			row.push(field);
			field = "";
			continue;
		}
		if (char === "\r") {
			continue;
		}
		if (char === "\n") {
			row.push(field);
			rows.push(row);
			field = "";
			row = [];
			continue;
		}
		field += char;
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const header = (rows.shift() ?? []).map((name) => name.trim());
	return rows
		.filter((entry) => entry.some((value) => value.length > 0))
		.map((entry) =>
			Object.fromEntries(
				header.map((name, index) => [name, entry[index] ?? ""])
			)
		);
}

export function csvNumber(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function timeZoneOffsetMs(at: Date, timeZone: string): number {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const parts = formatter.formatToParts(at);
	const part = (type: string) =>
		Number(parts.find((entry) => entry.type === type)?.value ?? "0");
	const asUtc = Date.UTC(
		part("year"),
		part("month") - 1,
		part("day"),
		part("hour") % 24,
		part("minute"),
		part("second")
	);
	return asUtc - at.getTime();
}

function zonedDayStartUtc(date: string, timeZone: string): Date {
	const utcMidnight = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(utcMidnight.getTime())) {
		throw new Error(`Unparseable rollup date: ${date}`);
	}
	try {
		return new Date(
			utcMidnight.getTime() - timeZoneOffsetMs(utcMidnight, timeZone)
		);
	} catch {
		return utcMidnight;
	}
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
	referrer: "referrer",
	source: "sourceName",
} as const satisfies Partial<Record<RollupDimensionKind, keyof ImportedEvent>>;

type SynthesizedDimension = keyof typeof DIMENSION_FIELDS;

function isSynthesizedDimension(
	kind: RollupDimensionKind
): kind is SynthesizedDimension {
	return kind in DIMENSION_FIELDS;
}

function assignDimension(
	perSession: number[],
	totals: DimensionTotal[]
): Array<string | undefined> {
	const assigned = Array.from<string | undefined>({
		length: perSession.length,
	});
	let session = 0;
	for (const total of [...totals].sort((a, b) => b.pageviews - a.pageviews)) {
		let budget = total.pageviews;
		while (budget > 0 && session < perSession.length) {
			assigned[session] = total.value;
			budget -= perSession[session];
			session += 1;
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

	const { visits, bounces, nonBounce } = sessionShape(
		slots.length,
		bucket.totals.visits ?? bucket.totals.visitors ?? 1,
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
	const requestedVisits = Math.round(
		bucket.totals.visits ?? bucket.totals.visitors ?? 1
	);
	const adjustments: ImportAdjustments = {
		droppedVisits: Math.max(0, requestedVisits - visits),
		durationDeltaSeconds: 0,
	};

	const perSession: number[] = [];
	for (let i = 0; i < bounces; i += 1) {
		perSession.push(1);
	}
	const remaining = slots.length - bounces;
	if (nonBounce > 0) {
		const base = Math.floor(remaining / nonBounce);
		const extra = remaining % nonBounce;
		for (let i = 0; i < nonBounce; i += 1) {
			perSession.push(base + (i < extra ? 1 : 0));
		}
	}

	const durations = Array.from(
		{ length: perSession.length },
		() => BOUNCE_DURATION_SECONDS
	);
	const nonBounceBudget = Math.max(
		0,
		totalDuration - bounces * BOUNCE_DURATION_SECONDS
	);
	if (nonBounce > 0) {
		const base = Math.floor(nonBounceBudget / nonBounce);
		let remainder = nonBounceBudget - base * nonBounce;
		for (let i = bounces; i < perSession.length; i += 1) {
			const extra = remainder > 0 ? 1 : 0;
			remainder -= extra;
			durations[i] =
				perSession[i] === 1
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
		for (let i = 0; i < bounces; i += 1) {
			const extra = remainder > 0 ? 1 : 0;
			remainder -= extra;
			durations[i] = base + extra;
		}
	}

	adjustments.durationDeltaSeconds =
		durations.reduce((total, value) => total + value, 0) - totalDuration;

	const sessionDimensions = new Map(
		[...bucket.dimensions].map(([kind, totals]) => [
			kind,
			assignDimension(perSession, totals),
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
		(Math.max(...perSession) + 1) * INTRA_SESSION_GAP_SECONDS;
	const spreadSeconds = Math.max(
		0,
		SECONDS_PER_DAY - Math.min(longestSessionSeconds, SECONDS_PER_DAY)
	);
	const sessionStride = Math.floor(spreadSeconds / visits) * 1000;
	const events: ImportedEvent[] = [];
	let slotIndex = 0;

	for (let session = 0; session < perSession.length; session += 1) {
		const pageviews = perSession[session];
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

		const timeOnPage = durations[session];
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

export function toEventRow(
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
		referrer: event.referrer ?? event.sourceName ?? null,
		browser_name: event.browserName ?? null,
		os_name: event.osName ?? null,
		device_type: event.deviceType ?? null,
		language: event.language ?? null,
		timezone: context.timezone,
		country: event.country ?? null,
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
			...event.properties,
		}),
		created_at: clickHouseDateTime(new Date()),
	};
}

async function insertChunk(
	rows: EventsInsert[],
	providerId: string
): Promise<void> {
	const token = createHash("sha256")
		.update(providerId)
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

	await clickHouse.command({
		query: `ALTER TABLE ${TABLE_NAMES.events} DELETE WHERE client_id = {websiteId:String} AND ${conditions.join(" AND ")}`,
		query_params: {
			websiteId,
			...(providerId ? { providerId } : {}),
			...(exceptRunId ? { exceptRunId } : {}),
		},
		clickhouse_settings: { mutations_sync: "1" },
	});
}

export async function runImport(options: {
	provider: ImportProvider;
	source: ImportSource;
	context: ImportContext;
	onProgress?: (progress: { rows: number }) => void | Promise<void>;
}): Promise<ImportResult> {
	const { provider, source, context, onProgress } = options;
	const buckets = new Map<string, DateBucket>();
	const pending: EventsInsert[] = [];
	let rows = 0;
	let skippedRollups = 0;
	const adjustments: ImportAdjustments = {
		droppedVisits: 0,
		durationDeltaSeconds: 0,
	};

	const flush = async (force: boolean) => {
		while (
			pending.length >= INSERT_CHUNK_SIZE ||
			(force && pending.length > 0)
		) {
			const chunk = pending.splice(0, INSERT_CHUNK_SIZE);
			await insertChunk(chunk, provider.id);
			rows += chunk.length;
			await onProgress?.({ rows });
		}
	};

	const emit = async (events: ImportedEvent[]) => {
		for (const event of events) {
			pending.push(toEventRow(event, context, provider.id));
		}
		await flush(false);
	};

	for await (const record of provider.parse(source, context)) {
		if (record.grain === "event") {
			await emit([record]);
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
		} else {
			skippedRollups += 1;
		}
		buckets.set(record.date, bucket);
	}

	for (const [date, bucket] of buckets) {
		const synthesized = synthesizeDate(date, bucket, context);
		adjustments.droppedVisits += synthesized.adjustments.droppedVisits;
		adjustments.durationDeltaSeconds +=
			synthesized.adjustments.durationDeltaSeconds;
		await emit(synthesized.events);
	}
	await flush(true);

	return { rows, dates: buckets.size, skippedRollups, adjustments };
}

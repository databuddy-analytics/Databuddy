import type { AppRouter } from "@databuddy/rpc";
import type { RouterClient } from "@orpc/server";
import {
	type CustomResourceOptions,
	dynamic,
	type Input,
	type Output,
	type Unwrap,
} from "@pulumi/pulumi";

type Api = RouterClient<AppRouter>;

interface Endpoints {
	"statusPage/addMonitor": Api["statusPage"]["addMonitor"];
	"statusPage/create": Api["statusPage"]["create"];
	"statusPage/delete": Api["statusPage"]["delete"];
	"statusPage/get": Api["statusPage"]["get"];
	"statusPage/removeMonitor": Api["statusPage"]["removeMonitor"];
	"statusPage/update": Api["statusPage"]["update"];
	"statusPage/updateMonitorSettings": Api["statusPage"]["updateMonitorSettings"];
	"uptime/createSchedule": Api["uptime"]["createSchedule"];
	"uptime/deleteSchedule": Api["uptime"]["deleteSchedule"];
	"uptime/getSchedule": Api["uptime"]["getSchedule"];
	"uptime/pauseSchedule": Api["uptime"]["pauseSchedule"];
	"uptime/resumeSchedule": Api["uptime"]["resumeSchedule"];
	"uptime/updateSchedule": Api["uptime"]["updateSchedule"];
}

type Endpoint = keyof Endpoints;
type EndpointInput<E extends Endpoint> = Parameters<Endpoints[E]>[0];
type EndpointOutput<E extends Endpoint> = Awaited<ReturnType<Endpoints[E]>>;

const DEFAULT_API_URL = "https://api.databuddy.cc";
const TRAILING_SLASHES = /\/+$/;
const ALREADY_EXISTS = /already/i;
const STATUS_PAGE_SLUG = /^[a-z0-9-]{1,100}$/;
const WEBSITE_RESOURCE = /^website$/i;
const MAX_IN_FLIGHT = 8;
const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
const UPTIME_GRANULARITIES = [
	"minute",
	"five_minutes",
	"ten_minutes",
	"thirty_minutes",
	"hour",
	"six_hours",
	"twelve_hours",
	"day",
] as const;
const SLOTS_KEY = "__databuddyPulumiSlots";
const TRANSIENT_STATUSES = [502, 503, 504];
const IDEMPOTENT_ENDPOINTS: Endpoint[] = [
	"statusPage/delete",
	"statusPage/get",
	"statusPage/removeMonitor",
	"statusPage/update",
	"statusPage/updateMonitorSettings",
	"uptime/deleteSchedule",
	"uptime/getSchedule",
	"uptime/updateSchedule",
];
const UNKNOWN_DURING_PREVIEW = "04da6b54-80e4-46f7-96ec-b56ff0331ba9";
const MISSING_API_KEY =
	"Missing Databuddy API key. Run `pulumi config set --secret databuddy:apiKey <key>` with Pulumi 3.216 or newer, or export DATABUDDY_API_KEY in the shell that runs pulumi.";
const INVALID_API_URL =
	"Invalid databuddy:apiUrl or DATABUDDY_API_URL: use an absolute HTTPS URL, or HTTP on localhost, 127.0.0.1, or [::1].";
const ALIAS_HINT =
	". If you renamed this resource or moved it under another parent, add `aliases` so Pulumi updates it instead of creating a second one. Otherwise another stack or the dashboard already uses it.";
const SLUG_HINT =
	". Status page slugs are unique across every Databuddy account, so pick another slug.";

interface Connection {
	apiKey: string;
	apiUrl: string;
}

interface ApiResponse {
	headers: Headers;
	ok: boolean;
	status: number;
	statusText: string;
	text: string;
}

interface ApiErrorBody {
	code?: string;
	data?: {
		issues?: { message?: string; path?: PropertyKey[] }[];
		resourceType?: string;
	};
	error?: string;
	message?: string;
}

interface Slots {
	active: number;
	waiting: (() => void)[];
}

function resolveConnection(config: dynamic.Config): Connection {
	const apiUrl =
		config.get("databuddy:apiUrl") ??
		process.env.DATABUDDY_API_URL ??
		DEFAULT_API_URL;
	let parsed: URL;
	try {
		parsed = new URL(apiUrl);
	} catch {
		throw new Error(INVALID_API_URL);
	}
	const { hostname, protocol } = parsed;
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
	if (protocol !== "https:" && !(protocol === "http:" && loopback)) {
		throw new Error(INVALID_API_URL);
	}
	return {
		apiKey:
			config.get("databuddy:apiKey") ?? process.env.DATABUDDY_API_KEY ?? "",
		apiUrl: apiUrl.replace(TRAILING_SLASHES, ""),
	};
}

function slots(): Slots {
	const store = globalThis as typeof globalThis & { [SLOTS_KEY]?: Slots };
	const existing = store[SLOTS_KEY];
	if (existing) {
		return existing;
	}
	const created: Slots = { active: 0, waiting: [] };
	store[SLOTS_KEY] = created;
	return created;
}

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
	const pool = slots();
	if (pool.active < MAX_IN_FLIGHT) {
		pool.active += 1;
	} else {
		await new Promise<void>((resolve) => pool.waiting.push(resolve));
	}
	try {
		return await task();
	} finally {
		const next = pool.waiting.shift();
		if (next) {
			next();
		} else {
			pool.active -= 1;
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response: ApiResponse | null, attempt: number): number {
	const header = response?.headers.get("retry-after");
	const seconds = Number(header);
	let requested = Number.NaN;
	if (seconds > 0) {
		requested = seconds * 1000;
	} else if (header) {
		requested = Date.parse(header) - Date.now();
	}
	const base = requested > 0 ? requested : 500 * 2 ** attempt;
	return Math.min(base, MAX_RETRY_DELAY_MS) + Math.random() * 250;
}

function describeFailure(error: unknown): string {
	let current = error;
	while (current instanceof Error && current.cause !== undefined) {
		current = current.cause;
	}
	if (current instanceof AggregateError && current.errors.length > 0) {
		current = current.errors[0];
	}
	const code = (current as { code?: unknown } | null)?.code;
	const message = current instanceof Error ? current.message : String(current);
	return typeof code === "string" ? `${code} ${message}` : message;
}

async function send<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>,
	attempt = 1
): Promise<ApiResponse> {
	if (!connection.apiKey) {
		throw new Error(MISSING_API_KEY);
	}
	const url = `${connection.apiUrl}/${endpoint}`;
	const idempotent = IDEMPOTENT_ENDPOINTS.includes(endpoint);
	const response = await withSlot(async (): Promise<ApiResponse> => {
		const raw = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": connection.apiKey,
			},
			body: JSON.stringify(input),
			redirect: "manual",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		return {
			headers: raw.headers,
			ok: raw.ok,
			status: raw.status,
			statusText: raw.statusText,
			text: await raw.text(),
		};
	}).catch((error: unknown) => {
		const timedOut = error instanceof Error && error.name === "TimeoutError";
		if (idempotent && !timedOut && attempt < MAX_ATTEMPTS) {
			return null;
		}
		const unsure = idempotent
			? ""
			: " It may still have been applied, so check the dashboard before running again.";
		throw new Error(
			`Databuddy ${endpoint} request to ${url} failed: ${describeFailure(error)}.${unsure}`
		);
	});
	if (!response) {
		await sleep(retryDelay(null, attempt));
		return send(connection, endpoint, input, attempt + 1);
	}
	if (response.status >= 300 && response.status < 400) {
		throw new Error(
			`Databuddy ${endpoint} was redirected from ${url} to ${response.headers.get("location") ?? "another URL"}. Set databuddy:apiUrl to the API's final URL.`
		);
	}
	const transient =
		response.status === 429 ||
		(idempotent && TRANSIENT_STATUSES.includes(response.status));
	if (!transient || attempt >= MAX_ATTEMPTS) {
		return response;
	}
	await sleep(retryDelay(response, attempt));
	return send(connection, endpoint, input, attempt + 1);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResourceId(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === "string";
}

function validMonitorSettings(body: Record<string, unknown>): boolean {
	return (
		isNullableString(body.displayName) &&
		typeof body.hideLatency === "boolean" &&
		typeof body.hideUptimePercentage === "boolean" &&
		typeof body.hideUrl === "boolean" &&
		Number.isInteger(body.order)
	);
}

function validResponseBody(endpoint: Endpoint, body: Record<string, unknown>) {
	switch (endpoint) {
		case "uptime/createSchedule":
		case "uptime/updateSchedule":
			return isResourceId(body.scheduleId);
		case "uptime/getSchedule":
			return (
				isResourceId(body.id) &&
				typeof body.cacheBust === "boolean" &&
				UPTIME_GRANULARITIES.some((value) => value === body.granularity) &&
				isNullableString(body.name) &&
				typeof body.isPaused === "boolean" &&
				(body.timeout == null ||
					(typeof body.timeout === "number" &&
						Number.isFinite(body.timeout))) &&
				typeof body.url === "string" &&
				isNullableString(body.websiteId)
			);
		case "uptime/pauseSchedule":
			return body.success === true && body.isPaused === true;
		case "uptime/resumeSchedule":
			return body.success === true && body.isPaused === false;
		case "statusPage/create":
			return isResourceId(body.id) && isResourceId(body.organizationId);
		case "statusPage/get":
			return (
				isResourceId(body.id) &&
				isResourceId(body.organizationId) &&
				typeof body.name === "string" &&
				typeof body.slug === "string" &&
				[
					"description",
					"faviconUrl",
					"logoUrl",
					"supportUrl",
					"websiteUrl",
				].every((key) => isNullableString(body[key])) &&
				(body.theme === null ||
					["system", "light", "dark"].some((value) => value === body.theme)) &&
				Array.isArray(body.monitors) &&
				body.monitors.every(
					(monitor) =>
						isObject(monitor) &&
						isResourceId(monitor.id) &&
						isResourceId(monitor.uptimeScheduleId) &&
						validMonitorSettings(monitor)
				)
			);
		case "statusPage/addMonitor":
			return isResourceId(body.id) && validMonitorSettings(body);
		case "statusPage/update":
		case "statusPage/updateMonitorSettings":
			return isResourceId(body.id);
		default:
			return body.success === true;
	}
}

function parseBody<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	response: ApiResponse
): EndpointOutput<E> {
	let body: unknown;
	try {
		body = JSON.parse(response.text);
	} catch {
		throw new Error(
			`Databuddy ${endpoint} returned ${response.status} from ${connection.apiUrl} with a body that is not JSON: ${response.text.slice(0, 200)}`
		);
	}
	if (!(isObject(body) && validResponseBody(endpoint, body))) {
		const unsure = IDEMPOTENT_ENDPOINTS.includes(endpoint)
			? ""
			: " It may still have been applied, so check the dashboard before running again.";
		throw new Error(
			`Databuddy ${endpoint} returned ${response.status} from ${connection.apiUrl} with an invalid response body: ${response.text.slice(0, 200)}.${unsure}`
		);
	}
	// Validate lifecycle fields while allowing unused fields and future additions.
	return body as EndpointOutput<E>;
}

function readErrorBody(response: ApiResponse): ApiErrorBody {
	try {
		return (JSON.parse(response.text) as ApiErrorBody | null) ?? {};
	} catch {
		return {};
	}
}

function conflictHint(endpoint: Endpoint, reason: string): string {
	if (!ALREADY_EXISTS.test(reason)) {
		return "";
	}
	if (endpoint === "statusPage/create" || endpoint === "statusPage/update") {
		return SLUG_HINT;
	}
	if (
		endpoint === "uptime/createSchedule" ||
		endpoint === "statusPage/addMonitor"
	) {
		return ALIAS_HINT;
	}
	return "";
}

function apiError(
	connection: Connection,
	endpoint: Endpoint,
	response: ApiResponse,
	body: ApiErrorBody
): Error {
	const reason = body.message ?? body.error ?? response.statusText;
	const issues = (body.data?.issues ?? []).map((issue) =>
		issue.path?.length
			? `${issue.path.join(".")}: ${issue.message}`
			: issue.message
	);
	return new Error(
		`Databuddy ${endpoint} failed with ${response.status} from ${connection.apiUrl}: ${[reason, ...issues].join("; ")}${conflictHint(endpoint, reason)}`
	);
}

function isGone(response: ApiResponse, body: ApiErrorBody): boolean {
	const resourceType = body.data?.resourceType;
	return (
		response.status === 404 &&
		body.code === "NOT_FOUND" &&
		typeof resourceType === "string" &&
		!WEBSITE_RESOURCE.test(resourceType)
	);
}

async function call<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>
): Promise<EndpointOutput<E>> {
	const response = await send(connection, endpoint, input);
	if (!response.ok) {
		throw apiError(connection, endpoint, response, readErrorBody(response));
	}
	return parseBody(connection, endpoint, response);
}

async function find<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>
): Promise<EndpointOutput<E> | undefined> {
	const response = await send(connection, endpoint, input);
	if (response.ok) {
		return parseBody(connection, endpoint, response);
	}
	const body = readErrorBody(response);
	if (isGone(response, body)) {
		return;
	}
	throw apiError(connection, endpoint, response, body);
}

function initFailure(
	error: unknown,
	id: string,
	properties: object,
	inputs: object
): Error {
	const reason = error instanceof Error ? error.message : String(error);
	return Object.assign(new Error(reason), {
		id,
		properties: {
			...properties,
			__provider: (inputs as { __provider?: string }).__provider,
		},
		reasons: [reason],
	});
}

function changedKeys<T extends object>(olds: T, news: T): (keyof T)[] {
	return (Object.keys(news) as (keyof T)[]).filter(
		(key) => olds[key] !== news[key]
	);
}

function changedFields<T extends object>(olds: T, news: T): Partial<T> {
	return Object.fromEntries(
		changedKeys(olds, news).map((key) => [key, news[key]])
	) as Partial<T>;
}

function explicitInputs<T extends object>(
	value: T,
	defaults: T,
	required: (keyof T)[]
): Partial<T> {
	return Object.fromEntries(
		(Object.keys(value) as (keyof T)[])
			.filter((key) => required.includes(key) || value[key] !== defaults[key])
			.map((key) => [key, value[key]])
	) as Partial<T>;
}

function isHttpUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

class DatabuddyProvider {
	connection: Connection = { apiKey: "", apiUrl: DEFAULT_API_URL };

	configure(request: dynamic.ConfigureRequest): Promise<void> {
		this.connection = resolveConnection(request.config);
		return Promise.resolve();
	}
}

export type UptimeGranularity = (typeof UPTIME_GRANULARITIES)[number];

export interface UptimeMonitorArgs {
	cacheBust?: Input<boolean>;
	granularity: Input<UptimeGranularity>;
	name?: Input<string>;
	paused?: Input<boolean>;
	timeout?: Input<number>;
	url: Input<string>;
	websiteId?: Input<string>;
}

interface UptimeMonitorState {
	cacheBust: boolean;
	granularity: UptimeGranularity;
	name: string | null;
	paused: boolean;
	timeout: number | null;
	url: string;
	websiteId: string | null;
}

function uptimeMonitorState(
	args: Unwrap<UptimeMonitorArgs>
): UptimeMonitorState {
	return {
		cacheBust: args.cacheBust ?? false,
		granularity: args.granularity,
		name: args.name?.trim() || null,
		paused: args.paused ?? false,
		timeout: args.timeout ?? null,
		url: args.url,
		websiteId: args.websiteId ?? null,
	};
}

class UptimeMonitorProvider
	extends DatabuddyProvider
	implements
		dynamic.ResourceProvider<Unwrap<UptimeMonitorArgs>, UptimeMonitorState>
{
	check(_olds: Unwrap<UptimeMonitorArgs>, news: Unwrap<UptimeMonitorArgs>) {
		const { url } = news;
		const failures: dynamic.CheckFailure[] =
			typeof url === "string" &&
			url !== UNKNOWN_DURING_PREVIEW &&
			!isHttpUrl(url)
				? [{ property: "url", reason: "url must be an http or https URL" }]
				: [];
		const timeout: unknown = news.timeout;
		if (
			timeout != null &&
			timeout !== UNKNOWN_DURING_PREVIEW &&
			(typeof timeout !== "number" ||
				!Number.isInteger(timeout) ||
				timeout < 1000 ||
				timeout > 120_000)
		) {
			failures.push({
				property: "timeout",
				reason:
					"timeout must be an integer between 1000 and 120000 milliseconds",
			});
		}
		if (news.websiteId != null && typeof news.websiteId !== "string") {
			failures.push({
				property: "websiteId",
				reason: "websiteId must be a string",
			});
		}
		return Promise.resolve({ failures });
	}

	diff(_id: string, olds: UptimeMonitorState, news: Unwrap<UptimeMonitorArgs>) {
		const next = uptimeMonitorState(news);
		const changed = changedKeys(olds, next);
		return Promise.resolve({
			changes: changed.length > 0,
			replaces: changed.filter((key) => key === "url" || key === "websiteId"),
			deleteBeforeReplace:
				olds.url === next.url ||
				(olds.websiteId !== null && olds.websiteId === next.websiteId),
		});
	}

	async create(inputs: Unwrap<UptimeMonitorArgs>) {
		const state = uptimeMonitorState(inputs);
		const { scheduleId } = await call(
			this.connection,
			"uptime/createSchedule",
			{
				cacheBust: state.cacheBust,
				granularity: state.granularity,
				name: state.name ?? undefined,
				timeout: state.timeout ?? undefined,
				url: state.url,
				websiteId: state.websiteId ?? undefined,
			}
		);
		if (state.paused) {
			try {
				await call(this.connection, "uptime/pauseSchedule", { scheduleId });
			} catch (error) {
				throw initFailure(
					error,
					scheduleId,
					{ ...state, paused: false },
					inputs
				);
			}
		}
		return { id: scheduleId, outs: state };
	}

	async read(id: string): Promise<dynamic.ReadResult> {
		const schedule = await find(this.connection, "uptime/getSchedule", {
			scheduleId: id,
		});
		if (!schedule) {
			return {};
		}
		const props: UptimeMonitorState = {
			cacheBust: schedule.cacheBust,
			granularity: schedule.granularity,
			name: schedule.name,
			paused: schedule.isPaused,
			timeout: schedule.timeout ?? null,
			url: schedule.url,
			websiteId: schedule.websiteId,
		};
		const defaults = uptimeMonitorState({
			granularity: props.granularity,
			url: props.url,
		});
		return {
			id,
			props,
			inputs: explicitInputs(props, defaults, ["granularity", "url"]),
		};
	}

	async update(
		id: string,
		olds: UptimeMonitorState,
		news: Unwrap<UptimeMonitorArgs>
	) {
		const state = uptimeMonitorState(news);
		const changes = changedFields(olds, state);
		const settings = {
			cacheBust: changes.cacheBust,
			granularity: changes.granularity,
			name: changes.name,
			timeout: changes.timeout,
		};
		if (Object.values(settings).some((value) => value !== undefined)) {
			await call(this.connection, "uptime/updateSchedule", {
				...settings,
				scheduleId: id,
			});
		}
		if (state.paused !== olds.paused) {
			await this.setPaused(id, state.paused);
		}
		return { outs: state };
	}

	async setPaused(scheduleId: string, paused: boolean) {
		const live = await call(this.connection, "uptime/getSchedule", {
			scheduleId,
		});
		if (live.isPaused === paused) {
			return;
		}
		if (paused) {
			await call(this.connection, "uptime/pauseSchedule", { scheduleId });
		} else {
			await call(this.connection, "uptime/resumeSchedule", { scheduleId });
		}
	}

	async delete(id: string) {
		await find(this.connection, "uptime/deleteSchedule", { scheduleId: id });
	}
}

export class UptimeMonitor extends dynamic.Resource {
	declare readonly cacheBust: Output<boolean>;
	declare readonly granularity: Output<UptimeGranularity>;
	declare readonly name: Output<string | null>;
	declare readonly paused: Output<boolean>;
	declare readonly timeout: Output<number | null>;
	declare readonly url: Output<string>;
	declare readonly websiteId: Output<string | null>;

	constructor(
		name: string,
		args: UptimeMonitorArgs,
		opts?: CustomResourceOptions
	) {
		super(
			new UptimeMonitorProvider(),
			name,
			{
				cacheBust: undefined,
				name: undefined,
				paused: undefined,
				timeout: undefined,
				websiteId: undefined,
				...args,
			},
			opts,
			"databuddy",
			"UptimeMonitor"
		);
	}
}

export type StatusPageTheme = "system" | "light" | "dark";

export interface StatusPageArgs {
	description?: Input<string>;
	faviconUrl?: Input<string>;
	logoUrl?: Input<string>;
	name: Input<string>;
	slug: Input<string>;
	supportUrl?: Input<string>;
	theme?: Input<StatusPageTheme>;
	websiteUrl?: Input<string>;
}

interface StatusPageFields {
	description: string | null;
	faviconUrl: string | null;
	logoUrl: string | null;
	name: string;
	slug: string;
	supportUrl: string | null;
	theme: StatusPageTheme;
	websiteUrl: string | null;
}

interface StatusPageState extends StatusPageFields {
	organizationId: string;
}

type StatusPageShape = Pick<StatusPageFields, "name" | "slug"> & {
	[K in Exclude<keyof StatusPageFields, "name" | "slug">]?:
		| StatusPageFields[K]
		| null;
};

function statusPageFields(page: StatusPageShape): StatusPageFields {
	return {
		description: page.description || null,
		faviconUrl: page.faviconUrl || null,
		logoUrl: page.logoUrl || null,
		name: page.name,
		slug: page.slug,
		supportUrl: page.supportUrl || null,
		theme: page.theme ?? "system",
		websiteUrl: page.websiteUrl || null,
	};
}

class StatusPageProvider
	extends DatabuddyProvider
	implements dynamic.ResourceProvider<Unwrap<StatusPageArgs>, StatusPageState>
{
	check(_olds: Unwrap<StatusPageArgs>, news: Unwrap<StatusPageArgs>) {
		const { slug } = news;
		const failures =
			typeof slug === "string" &&
			slug !== UNKNOWN_DURING_PREVIEW &&
			!STATUS_PAGE_SLUG.test(slug)
				? [
						{
							property: "slug",
							reason:
								"slug must be 1 to 100 lowercase letters, numbers, or dashes",
						},
					]
				: [];
		return Promise.resolve({ failures });
	}

	diff(_id: string, olds: StatusPageState, news: Unwrap<StatusPageArgs>) {
		const changed = changedKeys(statusPageFields(olds), statusPageFields(news));
		return Promise.resolve({ changes: changed.length > 0 });
	}

	async create(inputs: Unwrap<StatusPageArgs>) {
		const fields = statusPageFields(inputs);
		const page = await call(this.connection, "statusPage/create", {
			...fields,
			description: fields.description ?? undefined,
		});
		if (!page) {
			throw new Error("Databuddy statusPage/create returned no status page");
		}
		const outs: StatusPageState = {
			...fields,
			organizationId: page.organizationId,
		};
		return { id: page.id, outs };
	}

	async read(id: string): Promise<dynamic.ReadResult> {
		const page = await find(this.connection, "statusPage/get", {
			statusPageId: id,
		});
		if (!page) {
			return {};
		}
		const fields = statusPageFields(page);
		const props: StatusPageState = {
			...fields,
			organizationId: page.organizationId,
		};
		const defaults = statusPageFields({ name: fields.name, slug: fields.slug });
		return {
			id,
			props,
			inputs: explicitInputs(fields, defaults, ["name", "slug"]),
		};
	}

	async update(
		id: string,
		olds: StatusPageState,
		news: Unwrap<StatusPageArgs>
	) {
		const fields = statusPageFields(news);
		const changes = changedFields(statusPageFields(olds), fields);
		await call(this.connection, "statusPage/update", {
			...changes,
			description: changes.description === null ? "" : changes.description,
			statusPageId: id,
		});
		const outs: StatusPageState = {
			...fields,
			organizationId: olds.organizationId,
		};
		return { outs };
	}

	async delete(id: string) {
		await find(this.connection, "statusPage/delete", { statusPageId: id });
	}
}

export class StatusPage extends dynamic.Resource {
	declare readonly description: Output<string | null>;
	declare readonly faviconUrl: Output<string | null>;
	declare readonly logoUrl: Output<string | null>;
	declare readonly name: Output<string>;
	declare readonly organizationId: Output<string>;
	declare readonly slug: Output<string>;
	declare readonly supportUrl: Output<string | null>;
	declare readonly theme: Output<StatusPageTheme>;
	declare readonly websiteUrl: Output<string | null>;

	constructor(
		name: string,
		args: StatusPageArgs,
		opts?: CustomResourceOptions
	) {
		super(
			new StatusPageProvider(),
			name,
			{
				description: undefined,
				faviconUrl: undefined,
				logoUrl: undefined,
				organizationId: undefined,
				supportUrl: undefined,
				theme: undefined,
				websiteUrl: undefined,
				...args,
			},
			opts,
			"databuddy",
			"StatusPage"
		);
	}
}

export interface StatusPageMonitorArgs {
	displayName?: Input<string>;
	hideLatency?: Input<boolean>;
	hideUptimePercentage?: Input<boolean>;
	hideUrl?: Input<boolean>;
	monitorId: Input<string>;
	order?: Input<number>;
	statusPageId: Input<string>;
}

interface StatusPageMonitorSettings {
	displayName: string | null;
	hideLatency: boolean;
	hideUptimePercentage: boolean;
	hideUrl: boolean;
	order: number;
}

interface StatusPageMonitorState extends StatusPageMonitorSettings {
	entryId: string;
	monitorId: string;
	statusPageId: string;
}

function statusPageMonitorSettings(
	entry: {
		[K in keyof StatusPageMonitorSettings]?:
			| StatusPageMonitorSettings[K]
			| null;
	}
): StatusPageMonitorSettings {
	return {
		displayName: entry.displayName?.trim() || null,
		hideLatency: entry.hideLatency ?? false,
		hideUptimePercentage: entry.hideUptimePercentage ?? false,
		hideUrl: entry.hideUrl ?? false,
		order: entry.order ?? 0,
	};
}

function splitStatusPageMonitorId(id: string) {
	const separator = id.indexOf("/");
	return {
		monitorId: id.slice(separator + 1),
		statusPageId: id.slice(0, separator),
	};
}

class StatusPageMonitorProvider
	extends DatabuddyProvider
	implements
		dynamic.ResourceProvider<
			Unwrap<StatusPageMonitorArgs>,
			StatusPageMonitorState
		>
{
	diff(
		_id: string,
		olds: StatusPageMonitorState,
		news: Unwrap<StatusPageMonitorArgs>
	) {
		const replaces = (["statusPageId", "monitorId"] as const).filter(
			(key) => olds[key] !== news[key]
		);
		const changed = changedKeys(
			statusPageMonitorSettings(olds),
			statusPageMonitorSettings(news)
		);
		return Promise.resolve({
			changes: replaces.length > 0 || changed.length > 0,
			replaces: [...replaces],
		});
	}

	async create(inputs: Unwrap<StatusPageMonitorArgs>) {
		const settings = statusPageMonitorSettings(inputs);
		const entry = await call(this.connection, "statusPage/addMonitor", {
			statusPageId: inputs.statusPageId,
			uptimeScheduleId: inputs.monitorId,
		});
		if (!entry) {
			throw new Error("Databuddy statusPage/addMonitor returned no entry");
		}
		const id = `${inputs.statusPageId}/${inputs.monitorId}`;
		const placement = {
			entryId: entry.id,
			monitorId: inputs.monitorId,
			statusPageId: inputs.statusPageId,
		};
		try {
			await call(this.connection, "statusPage/updateMonitorSettings", {
				...settings,
				monitorId: entry.id,
			});
		} catch (error) {
			throw initFailure(
				error,
				id,
				{ ...statusPageMonitorSettings(entry), ...placement },
				inputs
			);
		}
		const outs: StatusPageMonitorState = { ...settings, ...placement };
		return { id, outs };
	}

	async read(id: string): Promise<dynamic.ReadResult> {
		const { monitorId, statusPageId } = splitStatusPageMonitorId(id);
		const page = await find(this.connection, "statusPage/get", {
			statusPageId,
		});
		const entry = page?.monitors.find(
			(monitor) => monitor.uptimeScheduleId === monitorId
		);
		if (!entry) {
			return {};
		}
		const settings = statusPageMonitorSettings(entry);
		const props: StatusPageMonitorState = {
			...settings,
			entryId: entry.id,
			monitorId,
			statusPageId,
		};
		return {
			id,
			props,
			inputs: {
				...explicitInputs(settings, statusPageMonitorSettings({}), []),
				monitorId,
				statusPageId,
			},
		};
	}

	async update(
		_id: string,
		olds: StatusPageMonitorState,
		news: Unwrap<StatusPageMonitorArgs>
	) {
		const settings = statusPageMonitorSettings(news);
		await call(this.connection, "statusPage/updateMonitorSettings", {
			...changedFields(statusPageMonitorSettings(olds), settings),
			monitorId: olds.entryId,
		});
		const outs: StatusPageMonitorState = { ...olds, ...settings };
		return { outs };
	}

	async delete(id: string) {
		const { monitorId, statusPageId } = splitStatusPageMonitorId(id);
		await find(this.connection, "statusPage/removeMonitor", {
			statusPageId,
			uptimeScheduleId: monitorId,
		});
	}
}

export class StatusPageMonitor extends dynamic.Resource {
	declare readonly displayName: Output<string | null>;
	declare readonly hideLatency: Output<boolean>;
	declare readonly hideUptimePercentage: Output<boolean>;
	declare readonly hideUrl: Output<boolean>;
	declare readonly monitorId: Output<string>;
	declare readonly order: Output<number>;
	declare readonly statusPageId: Output<string>;

	constructor(
		name: string,
		args: StatusPageMonitorArgs,
		opts?: CustomResourceOptions
	) {
		super(
			new StatusPageMonitorProvider(),
			name,
			{
				displayName: undefined,
				entryId: undefined,
				hideLatency: undefined,
				hideUptimePercentage: undefined,
				hideUrl: undefined,
				order: undefined,
				...args,
			},
			opts,
			"databuddy",
			"StatusPageMonitor"
		);
	}
}

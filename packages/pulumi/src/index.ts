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
const MISSING_API_KEY =
	"Missing Databuddy API key. Run `pulumi config set --secret databuddy:apiKey <key>` or set DATABUDDY_API_KEY.";

interface Connection {
	apiKey: string;
	apiUrl: string;
}

interface ApiErrorBody {
	code?: string;
	data?: { issues?: { message?: string; path?: PropertyKey[] }[] };
	message?: string;
}

function resolveConnection(config: dynamic.Config): Connection {
	const apiUrl =
		config.get("databuddy:apiUrl") ??
		process.env.DATABUDDY_API_URL ??
		DEFAULT_API_URL;
	return {
		apiKey:
			config.get("databuddy:apiKey") ?? process.env.DATABUDDY_API_KEY ?? "",
		apiUrl: apiUrl.replace(TRAILING_SLASHES, ""),
	};
}

function send<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>
): Promise<Response> {
	if (!connection.apiKey) {
		throw new Error(MISSING_API_KEY);
	}
	return fetch(`${connection.apiUrl}/${endpoint}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": connection.apiKey,
		},
		body: JSON.stringify(input),
	});
}

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
	return (
		((await response.json().catch(() => null)) as ApiErrorBody | null) ?? {}
	);
}

function apiError(
	endpoint: Endpoint,
	response: Response,
	body: ApiErrorBody
): Error {
	const issues = (body.data?.issues ?? []).map((issue) =>
		issue.path?.length
			? `${issue.path.join(".")}: ${issue.message}`
			: issue.message
	);
	const message = [body.message ?? response.statusText, ...issues].join("; ");
	return new Error(
		`Databuddy ${endpoint} failed with ${response.status}: ${message}`
	);
}

async function call<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>
): Promise<EndpointOutput<E>> {
	const response = await send(connection, endpoint, input);
	if (!response.ok) {
		throw apiError(endpoint, response, await readErrorBody(response));
	}
	return (await response.json()) as EndpointOutput<E>;
}

async function find<E extends Endpoint>(
	connection: Connection,
	endpoint: E,
	input: EndpointInput<E>
): Promise<EndpointOutput<E> | undefined> {
	const response = await send(connection, endpoint, input);
	if (response.ok) {
		return (await response.json()) as EndpointOutput<E>;
	}
	const body = await readErrorBody(response);
	if (body.code === "NOT_FOUND") {
		return;
	}
	throw apiError(endpoint, response, body);
}

function changedKeys<T extends object>(olds: T, news: T): (keyof T)[] {
	return (Object.keys(news) as (keyof T)[]).filter(
		(key) => olds[key] !== news[key]
	);
}

class DatabuddyProvider {
	connection: Connection = { apiKey: "", apiUrl: DEFAULT_API_URL };

	configure(request: dynamic.ConfigureRequest): Promise<void> {
		this.connection = resolveConnection(request.config);
		return Promise.resolve();
	}
}

export type UptimeGranularity =
	| "minute"
	| "five_minutes"
	| "ten_minutes"
	| "thirty_minutes"
	| "hour"
	| "six_hours"
	| "twelve_hours"
	| "day";

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
	diff(_id: string, olds: UptimeMonitorState, news: Unwrap<UptimeMonitorArgs>) {
		const changed = changedKeys(olds, uptimeMonitorState(news));
		return Promise.resolve({
			changes: changed.length > 0,
			replaces: changed.filter((key) => key === "url" || key === "websiteId"),
			deleteBeforeReplace: true,
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
				await find(this.connection, "uptime/deleteSchedule", { scheduleId });
				throw error;
			}
		}
		return { id: scheduleId, outs: state };
	}

	async read(id: string) {
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
		return { id, props };
	}

	async update(
		id: string,
		olds: UptimeMonitorState,
		news: Unwrap<UptimeMonitorArgs>
	) {
		const state = uptimeMonitorState(news);
		await call(this.connection, "uptime/updateSchedule", {
			cacheBust: state.cacheBust,
			granularity: state.granularity,
			name: state.name,
			scheduleId: id,
			timeout: state.timeout,
		});
		if (state.paused && !olds.paused) {
			await call(this.connection, "uptime/pauseSchedule", { scheduleId: id });
		}
		if (!state.paused && olds.paused) {
			await call(this.connection, "uptime/resumeSchedule", { scheduleId: id });
		}
		return { outs: state };
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
	organizationId?: Input<string>;
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
		faviconUrl: page.faviconUrl ?? null,
		logoUrl: page.logoUrl ?? null,
		name: page.name,
		slug: page.slug,
		supportUrl: page.supportUrl ?? null,
		theme: page.theme ?? "system",
		websiteUrl: page.websiteUrl ?? null,
	};
}

class StatusPageProvider
	extends DatabuddyProvider
	implements dynamic.ResourceProvider<Unwrap<StatusPageArgs>, StatusPageState>
{
	diff(_id: string, olds: StatusPageState, news: Unwrap<StatusPageArgs>) {
		const movesOrganization =
			news.organizationId !== undefined &&
			news.organizationId !== olds.organizationId;
		const changed = changedKeys(statusPageFields(olds), statusPageFields(news));
		return Promise.resolve({
			changes: movesOrganization || changed.length > 0,
			replaces: movesOrganization ? ["organizationId"] : [],
			deleteBeforeReplace: true,
		});
	}

	async create(inputs: Unwrap<StatusPageArgs>) {
		const fields = statusPageFields(inputs);
		const page = await call(this.connection, "statusPage/create", {
			...fields,
			description: fields.description ?? undefined,
			organizationId: inputs.organizationId,
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

	async read(id: string) {
		const page = await find(this.connection, "statusPage/get", {
			statusPageId: id,
		});
		if (!page) {
			return {};
		}
		const props: StatusPageState = {
			...statusPageFields(page),
			organizationId: page.organizationId,
		};
		return { id, props };
	}

	async update(
		id: string,
		olds: StatusPageState,
		news: Unwrap<StatusPageArgs>
	) {
		const fields = statusPageFields(news);
		await call(this.connection, "statusPage/update", {
			...fields,
			description: fields.description ?? "",
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
			deleteBeforeReplace: true,
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
		try {
			await call(this.connection, "statusPage/updateMonitorSettings", {
				...settings,
				monitorId: entry.id,
			});
		} catch (error) {
			await find(this.connection, "statusPage/removeMonitor", {
				statusPageId: inputs.statusPageId,
				uptimeScheduleId: inputs.monitorId,
			});
			throw error;
		}
		const outs: StatusPageMonitorState = {
			...settings,
			entryId: entry.id,
			monitorId: inputs.monitorId,
			statusPageId: inputs.statusPageId,
		};
		return { id: `${inputs.statusPageId}/${inputs.monitorId}`, outs };
	}

	async read(id: string) {
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
		const props: StatusPageMonitorState = {
			...statusPageMonitorSettings(entry),
			entryId: entry.id,
			monitorId,
			statusPageId,
		};
		return { id, props };
	}

	async update(
		_id: string,
		olds: StatusPageMonitorState,
		news: Unwrap<StatusPageMonitorArgs>
	) {
		const settings = statusPageMonitorSettings(news);
		await call(this.connection, "statusPage/updateMonitorSettings", {
			...settings,
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

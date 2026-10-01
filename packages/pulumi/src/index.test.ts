import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { dynamic, Unwrap } from "@pulumi/pulumi";
import type {
	StatusPage,
	StatusPageArgs,
	StatusPageMonitor,
	StatusPageMonitorArgs,
	UptimeMonitor,
	UptimeMonitorArgs,
} from "./index";

type MonitorInputs = Unwrap<UptimeMonitorArgs>;
type PageInputs = Unwrap<StatusPageArgs>;
type PlacementInputs = Unwrap<StatusPageMonitorArgs>;
type MonitorState = Unwrap<Pick<UptimeMonitor, keyof UptimeMonitorArgs>>;
type PageState = Unwrap<
	Pick<StatusPage, keyof StatusPageArgs | "organizationId">
>;
type PlacementState = Unwrap<
	Pick<StatusPageMonitor, keyof StatusPageMonitorArgs>
> & { entryId: string };

type Provider<Inputs, State> = Required<
	Pick<
		dynamic.ResourceProvider<Inputs, State>,
		"configure" | "create" | "read" | "update"
	>
>;

interface InitializationFailure<State> extends Error {
	id: string;
	properties: State & { __provider: string };
	reasons: string[];
}

let capturedProvider:
	| Provider<MonitorInputs, MonitorState>
	| Provider<PageInputs, PageState>
	| Provider<PlacementInputs, PlacementState>;

mock.module("@pulumi/pulumi", () => ({
	dynamic: {
		// Capture the existing provider without running Node-only function serialization in Bun.
		Resource: class {
			constructor(provider: typeof capturedProvider) {
				capturedProvider = provider;
			}
		},
	},
}));

const resources = await import("./index");
const schedule = {
	id: "monitor-1",
	cacheBust: false,
	granularity: "minute",
	name: null,
	isPaused: false,
	timeout: null,
	url: "https://api.example.test/health",
	websiteId: null,
};
const entry = {
	id: "entry-1",
	displayName: null,
	hideLatency: false,
	hideUptimePercentage: false,
	hideUrl: false,
	order: 0,
	uptimeScheduleId: "monitor-1",
};
const page = {
	id: "page-1",
	organizationId: "org-1",
	name: "Test",
	slug: "test",
	description: null,
	faviconUrl: null,
	logoUrl: null,
	supportUrl: null,
	theme: "system",
	websiteUrl: null,
	monitors: [entry],
};
const monitorState: MonitorState = {
	...schedule,
	granularity: "minute",
	paused: false,
};
const pageState: PageState = { ...page, theme: "system" };

function configure(
	apiUrl = "https://api.example.test"
): dynamic.ConfigureRequest {
	return {
		config: {
			get: (key) => (key === "databuddy:apiUrl" ? apiUrl : "test-key"),
			require: () => "test-key",
		},
	};
}

function mockFetch() {
	const implementation = Object.assign(async () => Response.json({}), {
		preconnect: globalThis.fetch.preconnect,
	});
	return spyOn(globalThis, "fetch").mockImplementation(implementation);
}

afterEach(() => mock.restore());

test("a failed pause preserves the monitor ID and recovers without creating another monitor", async () => {
	new resources.UptimeMonitor("api", {
		url: "https://api.example.test/health",
		granularity: "minute",
		paused: true,
	});
	const provider = capturedProvider as Provider<MonitorInputs, MonitorState>;
	await provider.configure(configure());
	const fetchMock = mockFetch()
		.mockResolvedValueOnce(Response.json({ scheduleId: "monitor-1" }))
		.mockResolvedValueOnce(
			Response.json({ message: "Pause failed" }, { status: 403 })
		)
		.mockResolvedValueOnce(Response.json(schedule))
		.mockResolvedValueOnce(Response.json({ success: true, isPaused: true }));
	const inputs = {
		url: "https://api.example.test/health",
		granularity: "minute" as const,
		paused: true,
		__provider: "serialized-provider",
	};
	const failure = await provider
		.create(inputs)
		.catch((error: InitializationFailure<MonitorState>) => error);
	expect(failure).toBeInstanceOf(Error);
	if (!("properties" in failure)) {
		throw new Error("Expected a recoverable initialization failure");
	}
	expect(failure.id).toBe("monitor-1");
	expect(failure.properties.paused).toBe(false);
	expect(failure.properties.__provider).toBe("serialized-provider");
	expect(failure.reasons).toHaveLength(1);
	const recovered = await provider.update(
		failure.id,
		failure.properties,
		inputs
	);
	expect(recovered.outs?.paused).toBe(true);
	expect(
		fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
	).toEqual([
		"/uptime/createSchedule",
		"/uptime/pauseSchedule",
		"/uptime/getSchedule",
		"/uptime/pauseSchedule",
	]);
	expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
		scheduleId: "monitor-1",
	});
});

test("failed placement settings preserve the entry ID and recover without adding another monitor", async () => {
	new resources.StatusPageMonitor("placement", {
		statusPageId: "page-1",
		monitorId: "monitor-1",
		hideUrl: true,
	});
	const provider = capturedProvider as Provider<
		PlacementInputs,
		PlacementState
	>;
	await provider.configure(configure());
	const fetchMock = mockFetch()
		.mockResolvedValueOnce(Response.json(entry))
		.mockResolvedValueOnce(
			Response.json({ message: "Settings failed" }, { status: 403 })
		)
		.mockResolvedValueOnce(Response.json({ id: "entry-1" }));
	const inputs = {
		statusPageId: "page-1",
		monitorId: "monitor-1",
		hideUrl: true,
		__provider: "serialized-provider",
	};
	const failure = await provider
		.create(inputs)
		.catch((error: InitializationFailure<PlacementState>) => error);
	expect(failure).toBeInstanceOf(Error);
	if (!("properties" in failure)) {
		throw new Error("Expected a recoverable initialization failure");
	}
	expect(failure.id).toBe("page-1/monitor-1");
	expect(failure.properties.entryId).toBe("entry-1");
	expect(failure.properties.hideUrl).toBe(false);
	expect(failure.properties.__provider).toBe("serialized-provider");
	const recovered = await provider.update(
		failure.id,
		failure.properties,
		inputs
	);
	expect(recovered.outs?.hideUrl).toBe(true);
	expect(
		fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
	).toEqual([
		"/statusPage/addMonitor",
		"/statusPage/updateMonitorSettings",
		"/statusPage/updateMonitorSettings",
	]);
	expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
		monitorId: "entry-1",
		hideUrl: true,
	});
});

test("API URL validation rejects insecure remote destinations before sending the key", async () => {
	new resources.UptimeMonitor("api", {
		url: "https://api.example.test/health",
		granularity: "minute",
	});
	const provider = capturedProvider as Provider<MonitorInputs, MonitorState>;
	const fetchMock = mockFetch();
	for (const apiUrl of [
		"http://api.example.test",
		"http://localhost.example.test",
		"http://localhost@api.example.test",
		"ftp://localhost",
		"api.example.test",
		"https://",
		"https://private-user:private-password@",
	]) {
		expect(() => provider.configure(configure(apiUrl))).toThrow(
			/databuddy:apiUrl.*DATABUDDY_API_URL.*HTTPS/
		);
	}
	let credentialFailure: unknown;
	try {
		provider.configure(configure("https://private-user:private-password@"));
	} catch (error) {
		credentialFailure = error;
	}
	expect(credentialFailure).toBeInstanceOf(Error);
	if (!(credentialFailure instanceof Error)) {
		throw new Error("Expected a configuration error");
	}
	expect(credentialFailure.message).not.toContain("private-user");
	expect(credentialFailure.message).not.toContain("private-password");
	expect(credentialFailure.cause).toBeUndefined();
	expect(fetchMock).not.toHaveBeenCalled();
	for (const apiUrl of [
		"https://api.example.test",
		"http://localhost:3001",
		"http://127.0.0.1:3001",
		"http://[::1]:3001",
	]) {
		await provider.configure(configure(apiUrl));
	}
});

test("malformed create IDs stop before a follow-up mutation", async () => {
	const inputs = {
		url: schedule.url,
		granularity: "minute" as const,
		paused: true,
	};
	new resources.UptimeMonitor("api", inputs);
	const monitor = capturedProvider as Provider<MonitorInputs, MonitorState>;
	await monitor.configure(configure());
	const fetchMock = mockFetch();
	for (const body of [{ scheduleId: " " }, { scheduleId: 1 }, {}, null, []]) {
		fetchMock.mockResolvedValueOnce(Response.json(body));
		await expect(monitor.create(inputs)).rejects.toThrow(
			/invalid response body/
		);
	}
	new resources.StatusPageMonitor("placement", {
		statusPageId: "page-1",
		monitorId: "monitor-1",
	});
	const placement = capturedProvider as Provider<
		PlacementInputs,
		PlacementState
	>;
	await placement.configure(configure());
	fetchMock.mockResolvedValueOnce(Response.json({ ...entry, id: null }));
	await expect(
		placement.create({ statusPageId: "page-1", monitorId: "monitor-1" })
	).rejects.toThrow(/invalid response body/);
	expect(
		fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
	).toEqual([
		...new Array<string>(5).fill("/uptime/createSchedule"),
		"/statusPage/addMonitor",
	]);
});

test("malformed refresh responses fail before returning resource state", async () => {
	new resources.UptimeMonitor("api", {
		url: schedule.url,
		granularity: "minute",
	});
	const monitor = capturedProvider as Provider<MonitorInputs, MonitorState>;
	await monitor.configure(configure());
	const malformedBody = JSON.stringify({
		...schedule,
		isPaused: "false",
		padding: "x".repeat(300),
		tail: "OUTSIDE_PREVIEW",
	});
	const fetchMock = mockFetch().mockResolvedValueOnce(
		new Response(malformedBody)
	);
	const failure = await monitor
		.read("monitor-1", monitorState)
		.catch((error: unknown) => error);
	expect(failure).toBeInstanceOf(Error);
	if (!(failure instanceof Error)) {
		throw new Error("Expected a malformed response error");
	}
	expect(failure.message).toBe(
		`Databuddy uptime/getSchedule returned 200 from https://api.example.test with an invalid response body: ${malformedBody.slice(0, 200)}.`
	);
	new resources.StatusPage("page", { name: page.name, slug: page.slug });
	const statusPage = capturedProvider as Provider<PageInputs, PageState>;
	await statusPage.configure(configure());
	for (const body of [
		{ ...page, organizationId: null },
		{ ...page, monitors: {} },
		{ ...page, monitors: [{ ...entry, hideUrl: "false" }] },
		{ ...page, theme: ["system"] },
	]) {
		fetchMock.mockResolvedValueOnce(Response.json(body));
		await expect(statusPage.read("page-1", pageState)).rejects.toThrow(
			/invalid response body/
		);
	}
	fetchMock.mockResolvedValueOnce(
		Response.json({
			...page,
			faviconUrl: "",
			logoUrl: "",
			supportUrl: "",
			websiteUrl: "",
			theme: null,
			newField: "allowed",
		})
	);
	const refreshed = await statusPage.read("page-1", pageState);
	expect(refreshed.props).toMatchObject({
		organizationId: "org-1",
		theme: "system",
		faviconUrl: null,
		logoUrl: null,
		supportUrl: null,
		websiteUrl: null,
	});
});

test("status-page creation requires an organization and settings updates require an entry acknowledgement", async () => {
	const inputs = { name: page.name, slug: page.slug };
	new resources.StatusPage("page", inputs);
	const statusPage = capturedProvider as Provider<PageInputs, PageState> &
		Required<Pick<dynamic.ResourceProvider<PageInputs, PageState>, "check">>;
	for (const slug of ["", "Bad_Slug", "x".repeat(101)]) {
		const result = await statusPage.check(inputs, { ...inputs, slug });
		expect(result.failures?.map((failure) => failure.property)).toEqual([
			"slug",
		]);
	}
	for (const slug of [
		"status",
		"x".repeat(100),
		"04da6b54-80e4-46f7-96ec-b56ff0331ba9",
	]) {
		const result = await statusPage.check(inputs, { ...inputs, slug });
		expect(result.failures).toEqual([]);
	}
	await statusPage.configure(configure());
	const fetchMock = mockFetch().mockResolvedValueOnce(
		Response.json({ id: "page-1", organizationId: 1 })
	);
	await expect(statusPage.create(inputs)).rejects.toThrow(
		/invalid response body/
	);
	new resources.StatusPageMonitor("placement", {
		statusPageId: "page-1",
		monitorId: "monitor-1",
	});
	const placement = capturedProvider as Provider<
		PlacementInputs,
		PlacementState
	>;
	await placement.configure(configure());
	fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
	await expect(
		placement.update(
			"page-1/monitor-1",
			{
				...entry,
				entryId: entry.id,
				monitorId: "monitor-1",
				statusPageId: "page-1",
			},
			{ statusPageId: "page-1", monitorId: "monitor-1", hideUrl: true }
		)
	).rejects.toThrow(/invalid response body/);
});

test("monitor checks enforce timeout bounds and preserve unresolved preview values", async () => {
	const inputs = { url: schedule.url, granularity: "minute" as const };
	new resources.UptimeMonitor("api", inputs);
	const provider = capturedProvider as Provider<MonitorInputs, MonitorState> &
		Required<
			Pick<dynamic.ResourceProvider<MonitorInputs, MonitorState>, "check">
		>;
	for (const timeout of [
		999,
		120_001,
		1000.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"1000",
		true,
	]) {
		const result = await provider.check(inputs, {
			...inputs,
			timeout,
		} as unknown as MonitorInputs);
		expect(result.failures).toEqual([
			{
				property: "timeout",
				reason:
					"timeout must be an integer between 1000 and 120000 milliseconds",
			},
		]);
	}
	for (const timeout of [undefined, null, 1000, 120_000]) {
		const result = await provider.check(inputs, {
			...inputs,
			timeout,
		} as unknown as MonitorInputs);
		expect(result.failures).toEqual([]);
	}
	const unknown = "04da6b54-80e4-46f7-96ec-b56ff0331ba9";
	const preview = await provider.check(inputs, {
		url: unknown,
		granularity: "minute",
		timeout: unknown,
		websiteId: unknown,
	} as unknown as MonitorInputs);
	expect(preview.failures).toEqual([]);
	const invalidWebsite = await provider.check(inputs, {
		...inputs,
		websiteId: 1,
	} as unknown as MonitorInputs);
	expect(invalidWebsite.failures).toEqual([
		{ property: "websiteId", reason: "websiteId must be a string" },
	]);
});

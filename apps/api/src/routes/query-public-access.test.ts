import "@databuddy/test/env";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { QueryRequest } from "@databuddy/ai/query/types";
import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicQueryRequestType } from "../schemas/query-schemas";

const state = vi.hoisted(() => ({
	isPublic: true,
	userId: null as string | null,
	isMember: false,
	apiKey: null as ApiKeyRow | null,
	executeBatch: vi.fn((requests: QueryRequest[]) =>
		Promise.resolve(requests.map(() => ({ data: [{ count: 1 }] })))
	),
	compileQuery: vi.fn(() => ({ sql: "SELECT 1", params: {} })),
	resolveTraitSegment: vi.fn(() => Promise.resolve(["example-profile"])),
}));

vi.mock("@databuddy/db", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/db")>()),
	db: {
		query: {
			websites: {
				findFirst: () =>
					Promise.resolve({
						id: "example-website",
						isPublic: state.isPublic,
						organizationId: "example-org",
					}),
			},
			member: {
				findFirst: () =>
					Promise.resolve(state.isMember ? { id: "example-member" } : null),
			},
		},
	},
}));
vi.mock("@databuddy/auth", () => ({
	auth: {
		api: {
			getSession: () =>
				Promise.resolve(
					state.userId ? { user: { id: state.userId }, session: {} } : null
				),
		},
	},
}));
vi.mock("@databuddy/api-keys/resolve", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/api-keys/resolve")>()),
	getApiKeyFromHeader: () => Promise.resolve(state.apiKey),
}));
vi.mock("@databuddy/redis/rate-limit", () => ({
	ratelimit: () => Promise.resolve({ success: true }),
	getRateLimitHeaders: () => ({}),
}));
vi.mock("@databuddy/ai/lib/tracing", () => ({
	mergeWideEvent: vi.fn(),
	captureError: vi.fn(),
}));
vi.mock("@databuddy/ai/lib/website-utils", () => ({
	getWebsiteDomain: () => Promise.resolve("example.com"),
}));
vi.mock("@databuddy/ai/lib/accessible-websites", () => ({
	getAccessibleWebsites: () => Promise.resolve([]),
}));
vi.mock("@databuddy/services/identity", () => ({
	isTraitFilterField: (field: string) => field.startsWith("trait:"),
	resolveTraitSegment: state.resolveTraitSegment,
	revealPii: (value: string) => value,
	TraitFilterError: class extends Error {},
}));
vi.mock("@databuddy/ai/query", () => ({
	allowedFilterFields: () => [],
	isFilterFieldAllowed: () => true,
	queryPlanGateError: () => Promise.resolve(null),
	truncateQueryErrorForLog: (value: string) => value,
	compileQuery: state.compileQuery,
	executeBatch: state.executeBatch,
}));

const { getQueryBuilder } = await import("@databuddy/ai/query/builders");
const { query } = await import("./query");
const app = new Elysia().use(query);
const dates = { startDate: "2026-01-01", endDate: "2026-01-07" };

type QueryBody =
	| DynamicQueryRequestType
	| DynamicQueryRequestType[]
	| {
			projectId: string;
			type: string;
			from: string;
			to: string;
			filters?: DynamicQueryRequestType["filters"];
	  };

function request(body: QueryBody, path = "/") {
	return app.handle(
		new Request(`http://localhost/v1/query${path}?website_id=example-website`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(state.apiKey && { "x-api-key": "dbdy_inert_example" }),
			},
			body: JSON.stringify(body),
		})
	);
}

beforeEach(() => {
	state.isPublic = true;
	state.userId = null;
	state.isMember = false;
	state.apiKey = null;
	vi.clearAllMocks();
});

describe("public website query access", () => {
	it("allows an unfiltered overview without authentication", async () => {
		const response = await request({
			...dates,
			parameters: ["summary_metrics", "top_pages"],
			filters: [],
		});
		expect(response.status).toBe(200);
		expect((await response.json()).success).toBe(true);
		expect(state.executeBatch).toHaveBeenCalledOnce();
	});

	it.each([
		"custom_events_recent",
		"custom_events_property_top_values",
		"custom_events_property_classification",
		"custom_events_discovery",
		"recent_errors",
		"error_summary",
		"vitals_overview",
		"profile_list",
	])("rejects anonymous %s before execution", async (type) => {
		expect(getQueryBuilder(type)?.publicAccess).toBe(false);
		const response = await request({ ...dates, parameters: [type] });
		expect(response.status).toBe(401);
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it("rejects the whole batch when an object parameter is private", async () => {
		const response = await request([
			{ ...dates, parameters: ["summary_metrics"] },
			{ ...dates, parameters: [{ name: "recent_errors", id: "overview" }] },
		]);
		expect(response.status).toBe(401);
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it.each([
		"trait:email",
		"profile_id",
		"anonymous_id",
		"country",
	])("requires website permission for the %s filter", async (field) => {
		const response = await request({
			...dates,
			parameters: ["summary_metrics"],
			filters: [{ field, op: "eq", value: "example-value" }],
		});
		expect(response.status).toBe(401);
		expect(state.resolveTraitSegment).not.toHaveBeenCalled();
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it("rejects a batch containing a filtered overview", async () => {
		const response = await request([
			{ ...dates, parameters: ["summary_metrics"] },
			{
				...dates,
				parameters: ["top_pages"],
				filters: [
					{ field: "anonymous_id", op: "eq", value: "example-visitor" },
				],
			},
		]);
		expect(response.status).toBe(401);
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it("does not treat a signed-in outsider as a website member", async () => {
		state.userId = "example-outsider";
		const response = await request({ ...dates, parameters: ["recent_errors"] });
		expect(response.status).toBe(403);
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it("preserves private queries and filtered overviews for website members", async () => {
		state.userId = "example-user";
		state.isMember = true;
		const response = await request({
			...dates,
			parameters: ["custom_events_recent", "recent_errors", "summary_metrics"],
			filters: [{ field: "anonymous_id", op: "eq", value: "example-visitor" }],
		});
		expect(response.status).toBe(200);
		expect(state.executeBatch).toHaveBeenCalledOnce();
	});

	it("requires authentication for a private website's overview", async () => {
		state.isPublic = false;
		const response = await request({
			...dates,
			parameters: ["summary_metrics"],
		});
		expect(response.status).toBe(401);
		expect(state.executeBatch).not.toHaveBeenCalled();
	});

	it.each([
		"example-org",
		"different-org",
	])("checks website-scoped API keys against organization %s", async (organizationId) => {
		state.apiKey = {
			id: "example-key",
			name: "Example",
			prefix: "dbdy_",
			start: "inert",
			keyHash: "inert",
			userId: null,
			organizationId,
			type: "user",
			scopes: [],
			metadata: { resources: { "website:example-website": ["read:data"] } },
			enabled: true,
			rateLimitEnabled: true,
			rateLimitTimeWindow: null,
			rateLimitMax: null,
			revokedAt: null,
			expiresAt: null,
			lastUsedAt: null,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		};
		const response = await request({ ...dates, parameters: ["recent_errors"] });
		if (organizationId === "example-org") {
			expect(response.status).toBe(200);
			expect(state.executeBatch).toHaveBeenCalledOnce();
		} else {
			expect(response.status).toBe(403);
			expect(state.executeBatch).not.toHaveBeenCalled();
		}
	});

	it("applies the same public policy to the compile endpoint", async () => {
		const body = {
			projectId: "example-website",
			type: "summary_metrics",
			from: dates.startDate,
			to: dates.endDate,
		};
		expect((await request(body, "/compile")).status).toBe(200);
		expect(state.compileQuery).toHaveBeenCalledOnce();
		state.compileQuery.mockClear();
		expect(
			(await request({ ...body, type: "recent_errors" }, "/compile")).status
		).toBe(401);
		expect(
			(
				await request(
					{
						...body,
						filters: [
							{ field: "trait:email", op: "eq", value: "example@example.com" },
						],
					},
					"/compile"
				)
			).status
		).toBe(401);
		expect(state.compileQuery).not.toHaveBeenCalled();
		expect(state.resolveTraitSegment).not.toHaveBeenCalled();
	});
});

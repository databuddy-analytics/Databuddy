import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createProcedureClient } from "@orpc/server";
import { createKeys } from "keypal";
import type { Context } from "../orpc";

const ORGANIZATION_A = "org-a";
const WEBSITE_A = "site-a";
const WEBSITE_B = "site-b";

const testKeys = createKeys({ prefix: "dbdy_", length: 48 });
const mockWithWorkspace = mock(async () => ({
	organizationId: "org-a",
	role: "admin",
}));
const mockAppendRpcAuditEvent = mock(async () => undefined);

mock.module("@databuddy/auth", () => ({
	auth: { api: { getSession: async () => null } },
}));
mock.module("@databuddy/api-keys/resolve", () => ({
	collectScopes: (key: { scopes: string[] }) => key.scopes,
	getApiKeyFromHeader: async () => null,
	keys: testKeys,
	markApiKeyUsed: async () => undefined,
	withApiKeyCacheInvalidation: async <T>(
		_hashes: Array<string | null | undefined>,
		operation: () => Promise<T>
	) => operation(),
}));
mock.module("../procedures/with-workspace", () => ({
	withWorkspace: mockWithWorkspace,
}));
mock.module("../lib/audit", () => ({
	appendRpcAuditEvent: mockAppendRpcAuditEvent,
	getAuditActor: () => ({ id: "user-a", type: "user" }),
	getAuditOrganizationId: () => ORGANIZATION_A,
	getAuditRequestContext: () => ({}),
}));

const { apikeysRouter } = await import("./apikeys");

function call<T>(procedure: T, context: Context) {
	return createProcedureClient(procedure as never, { context });
}

function apiKeyRow() {
	const now = new Date("2026-08-21T00:00:00.000Z");
	return {
		createdAt: now,
		enabled: true,
		expiresAt: null,
		id: "key-a",
		keyHash: "hash-a",
		lastUsedAt: null,
		metadata: {},
		name: "Existing key",
		organizationId: ORGANIZATION_A,
		prefix: "dbdy",
		rateLimitEnabled: true,
		rateLimitMax: null,
		rateLimitTimeWindow: null,
		revokedAt: null,
		scopes: [],
		start: "dbdy_abc",
		type: "user" as const,
		updatedAt: now,
		userId: null,
	};
}

function contextWithMatchedWebsites(matchedWebsiteIds: string[]): Context {
	const key = apiKeyRow();
	const database = {
		query: {
			apikey: {
				findFirst: async () => key,
			},
		},
		select: () => ({
			from: () => ({
				where: async () => matchedWebsiteIds.map((id) => ({ id })),
			}),
		}),
		transaction: async <T>(
			callback: (transaction: {
				insert: () => {
					values: (values: Record<string, unknown>) => {
						returning: () => Promise<Record<string, unknown>[]>;
					};
				};
			}) => Promise<T>
		) =>
			callback({
				insert: () => ({
					values: (values) => ({
						returning: async () => [values],
					}),
				}),
			}),
	};

	return {
		auditOrganizationId: undefined,
		anonymousId: null,
		apiKey: undefined,
		db: database,
		getBilling: async () => undefined,
		headers: new Headers(),
		organizationId: ORGANIZATION_A,
		session: undefined,
		sessionId: null,
		user: {
			email: "admin@example.com",
			id: "user-a",
			name: "Admin",
		},
	} as Context;
}

describe("apikeys website resource ownership", () => {
	beforeEach(() => {
		mockWithWorkspace.mockClear();
		mockAppendRpcAuditEvent.mockClear();
	});

	it("rejects create when a selected organization claims another organization's website", async () => {
		await expect(
			call(
				apikeysRouter.create,
				contextWithMatchedWebsites([])
			)({
				name: "Foreign website key",
				organizationId: ORGANIZATION_A,
				resources: { [`website:${WEBSITE_B}`]: ["read:data"] },
				scopes: [],
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"API key website resources must belong to the selected organization",
		});
	});

	it("rejects update when an existing key claims another organization's website", async () => {
		await expect(
			call(
				apikeysRouter.update,
				contextWithMatchedWebsites([])
			)({
				id: "key-a",
				resources: { [`website:${WEBSITE_B}`]: ["read:data"] },
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"API key website resources must belong to the selected organization",
		});
	});

	it("allows create for a website that belongs to the selected organization", async () => {
		const result = await call(
			apikeysRouter.create,
			contextWithMatchedWebsites([WEBSITE_A])
		)({
			name: "Owned website key",
			organizationId: ORGANIZATION_A,
			resources: { [`website:${WEBSITE_A}`]: ["read:data"] },
			scopes: [],
		});

		expect(result.id).toBeString();
		expect(result.secret).toStartWith("dbdy_");
		expect(mockAppendRpcAuditEvent).toHaveBeenCalledTimes(1);
	});
});

afterAll(() => {
	mock.restore();
});

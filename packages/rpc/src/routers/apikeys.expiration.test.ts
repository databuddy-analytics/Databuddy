import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	setSystemTime,
} from "bun:test";
import type { apikey } from "@databuddy/db/schema";
import { createProcedureClient } from "@orpc/server";
import { createKeys } from "keypal";
import type { Context } from "../orpc";

type ApiKeyRow = typeof apikey.$inferSelect;
type ApiKeyInsert = typeof apikey.$inferInsert;
type ApiKeyUpdate = Partial<ApiKeyInsert>;

const NOW = "2030-01-01T00:00:00.000Z";
const ORGANIZATION_ID = "org-expiration-test";
const testKeys = createKeys({ prefix: "dbdy_", length: 48 });
const mockCreateKey = mock((input: Parameters<typeof testKeys.create>[0]) =>
	testKeys.create(input)
);
// Isolate expiration behavior; permission checks have dedicated coverage in
// ../procedures/with-workspace.test.ts and apikeys.resource-ownership.test.ts.
const mockWithWorkspace = mock(async () => ({
	organizationId: ORGANIZATION_ID,
	role: "admin",
}));
const mockAppendRpcAuditEvent = mock(async () => undefined);
const mockInvalidate = mock(
	async <T>(
		_hashes: Array<string | null | undefined>,
		operation: () => Promise<T>
	) => operation()
);

let apikeysRouter: typeof import("./apikeys").apikeysRouter;
let auth: Context["auth"];

beforeAll(async () => {
	mock.module("@databuddy/auth", () => ({
		auth: { api: { getSession: async () => null } },
	}));
	mock.module("@databuddy/api-keys/resolve", () => ({
		collectScopes: (key: { scopes: string[] }) => key.scopes,
		getApiKeyFromHeader: async () => null,
		keys: { ...testKeys, create: mockCreateKey },
		markApiKeyUsed: async () => undefined,
		withApiKeyCacheInvalidation: mockInvalidate,
	}));
	mock.module("../procedures/with-workspace", () => ({
		withWorkspace: mockWithWorkspace,
	}));
	const actualAudit = await import("../lib/audit");
	mock.module("../lib/audit", () => ({
		...actualAudit,
		appendRpcAuditEvent: mockAppendRpcAuditEvent,
		getAuditActor: () => ({ id: "user-test", type: "user" }),
		getAuditRequestContext: () => ({}),
	}));
	({ apikeysRouter } = await import("./apikeys"));
	({ auth } = await import("@databuddy/auth"));
	mock.restore();
});

beforeEach(() => {
	setSystemTime(new Date(NOW));
	mockCreateKey.mockClear();
	mockWithWorkspace.mockClear();
	mockAppendRpcAuditEvent.mockClear();
	mockInvalidate.mockClear();
});

afterEach(() => {
	setSystemTime();
});

function fixture(expiresAt: Date | null = null) {
	const key: ApiKeyRow = {
		createdAt: new Date(NOW),
		enabled: true,
		expiresAt,
		id: "key-test",
		keyHash: "hash-test",
		lastUsedAt: null,
		metadata: {},
		name: "Test key",
		organizationId: ORGANIZATION_ID,
		prefix: "dbdy",
		rateLimitEnabled: true,
		rateLimitMax: null,
		rateLimitTimeWindow: null,
		revokedAt: null,
		scopes: [],
		start: "dbdy_test",
		type: "user",
		updatedAt: new Date(NOW),
		userId: null,
	};
	const writes: ApiKeyUpdate[] = [];
	const transactionDb = {
		insert: () => ({
			values: (values: ApiKeyInsert) => {
				writes.push(values);
				return { returning: async () => [{ ...key, ...values }] };
			},
		}),
		update: () => ({
			set: (values: ApiKeyUpdate) => {
				writes.push(values);
				return {
					where: () => ({ returning: async () => [{ ...key, ...values }] }),
				};
			},
		}),
	};
	const transaction = mock(
		async <T>(callback: (tx: typeof transactionDb) => Promise<T>) =>
			callback(transactionDb)
	);
	const database = new Proxy({} as Context["db"], {
		get(_target, property) {
			if (property === "query") {
				return { apikey: { findFirst: async () => key } };
			}
			if (property === "transaction") {
				return transaction;
			}
			throw new Error(`Unexpected database operation: ${String(property)}`);
		},
	});
	const context: Context = {
		auth,
		auditOrganizationId: undefined,
		anonymousId: null,
		apiKey: undefined,
		db: database,
		getBilling: async () => undefined,
		headers: new Headers(),
		organizationId: ORGANIZATION_ID,
		oauth: null,
		session: undefined,
		sessionId: null,
		user: {
			createdAt: new Date(NOW),
			email: "admin@example.com",
			emailVerified: true,
			id: "user-test",
			name: "Admin",
			twoFactorEnabled: false,
			updatedAt: new Date(NOW),
		},
	};
	return { context, transaction, writes };
}

const invalidExpirations = [
	"not-a-date",
	"",
	"2030-02-30T00:00:00Z",
	"2030-01-02",
	"2030-01-02T00:00:00",
	"2029-12-31T23:59:59.999Z",
	NOW,
	"2030-01-01T05:30:00+05:30",
];

describe("API key expiration", () => {
	it.each(
		invalidExpirations
	)("rejects create expiration %j before generating or persisting a key", async (expiresAt) => {
		const { context, transaction, writes } = fixture();
		await expect(
			createProcedureClient(apikeysRouter.create, { context })({
				name: "Test key",
				organizationId: ORGANIZATION_ID,
				expiresAt,
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
		expect(mockCreateKey).not.toHaveBeenCalled();
		expect(transaction).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
		expect(mockAppendRpcAuditEvent).not.toHaveBeenCalled();
	});

	it.each(
		invalidExpirations
	)("rejects update expiration %j before invalidating caches or persisting", async (expiresAt) => {
		const { context, transaction, writes } = fixture();
		await expect(
			createProcedureClient(apikeysRouter.update, { context })({
				id: "key-test",
				expiresAt,
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
		expect(mockInvalidate).not.toHaveBeenCalled();
		expect(transaction).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
		expect(mockAppendRpcAuditEvent).not.toHaveBeenCalled();
	});

	const futureExpirations = [
		"2030-01-01T00:00:00.001Z",
		"2030-01-02T00:00:00Z",
		"2030-01-02T05:30:00+05:30",
		"2032-02-29T00:00:00Z",
	];

	it.each(
		futureExpirations
	)("persists valid create expiration %s", async (expiresAt) => {
		const { context, writes } = fixture();
		const result = await createProcedureClient(apikeysRouter.create, {
			context,
		})({
			name: "Test key",
			organizationId: ORGANIZATION_ID,
			expiresAt,
		});
		expect(result.secret).toStartWith("dbdy_");
		expect(writes).toHaveLength(1);
		expect(writes[0]?.expiresAt).toEqual(new Date(expiresAt));
		expect(mockAppendRpcAuditEvent).toHaveBeenCalledTimes(1);
	});

	it.each(
		futureExpirations
	)("persists valid update expiration %s", async (expiresAt) => {
		const { context, writes } = fixture();
		const result = await createProcedureClient(apikeysRouter.update, {
			context,
		})({
			id: "key-test",
			expiresAt,
		});
		expect(result.expiresAt).toEqual(new Date(expiresAt));
		expect(writes).toHaveLength(1);
		expect(writes[0]?.expiresAt).toEqual(new Date(expiresAt));
		expect(mockAppendRpcAuditEvent).toHaveBeenCalledTimes(1);
	});

	it("creates a key without an expiration when omitted", async () => {
		const { context, writes } = fixture();
		await createProcedureClient(apikeysRouter.create, { context })({
			name: "Test key",
			organizationId: ORGANIZATION_ID,
		});
		expect(writes[0]?.expiresAt).toBeNull();
	});

	it("clears an existing expiration when update supplies null", async () => {
		const { context, writes } = fixture(new Date("2030-01-02T00:00:00Z"));
		const result = await createProcedureClient(apikeysRouter.update, {
			context,
		})({
			id: "key-test",
			expiresAt: null,
		});
		expect(result.expiresAt).toBeNull();
		expect(writes[0]?.expiresAt).toBeNull();
	});

	it("preserves an expired key's expiration when updating another field", async () => {
		const expiresAt = new Date("2029-12-31T00:00:00Z");
		const { context, writes } = fixture(expiresAt);
		const result = await createProcedureClient(apikeysRouter.update, {
			context,
		})({
			id: "key-test",
			name: "Renamed key",
		});
		expect(result.name).toBe("Renamed key");
		expect(result.expiresAt).toEqual(expiresAt);
		expect(writes[0]).not.toHaveProperty("expiresAt");
	});
});

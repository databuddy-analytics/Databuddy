import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resolveApiKey } from "@databuddy/api-keys/resolve";
import {
	reset,
	cleanup,
	hasTestDb,
	insertApiKey,
	insertOrganization,
} from "@databuddy/test";

const iit = hasTestDb ? it : it.skip;

beforeEach(() => reset());
afterAll(() => cleanup());

describe("resolveApiKey", () => {
	iit("resolves a valid key from x-api-key header", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({
			organizationId: org.id,
			scopes: ["read:data"],
		});

		const result = await resolveApiKey(
			new Headers({ "x-api-key": key.secret }),
		);
		expect(result.outcome).toBe("ok");
		expect(result.key?.id).toBe(key.id);
		expect(result.key?.organizationId).toBe(org.id);
	});

	iit("resolves a valid key from Authorization Bearer header", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({ organizationId: org.id });

		const result = await resolveApiKey(
			new Headers({ authorization: `Bearer ${key.secret}` }),
		);
		expect(result.outcome).toBe("ok");
		expect(result.key?.id).toBe(key.id);
	});

	iit("returns missing when no key header present", async () => {
		const result = await resolveApiKey(new Headers());
		expect(result.outcome).toBe("missing");
		expect(result.key).toBeNull();
	});

	iit("returns invalid for malformed key", async () => {
		const result = await resolveApiKey(
			new Headers({ "x-api-key": "not-a-valid-key" }),
		);
		expect(result.outcome).toBe("invalid");
		expect(result.key).toBeNull();
	});

	iit("returns invalid for key not in database", async () => {
		const result = await resolveApiKey(
			new Headers({
				"x-api-key": "dbdy_thisKeyDoesNotExistInTheDatabaseAtAll00000000",
			}),
		);
		expect(result.outcome).toBe("invalid");
		expect(result.key).toBeNull();
	});

	iit("returns disabled for disabled key", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({
			organizationId: org.id,
			enabled: false,
		});

		const result = await resolveApiKey(
			new Headers({ "x-api-key": key.secret }),
		);
		expect(result.outcome).toBe("disabled");
		expect(result.key).toBeNull();
	});

	iit("returns revoked for revoked key", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({
			organizationId: org.id,
			revokedAt: new Date(Date.now() - 60_000),
		});

		const result = await resolveApiKey(
			new Headers({ "x-api-key": key.secret }),
		);
		expect(result.outcome).toBe("revoked");
		expect(result.key).toBeNull();
	});

	iit("returns expired for expired key", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({
			organizationId: org.id,
			expiresAt: new Date(Date.now() - 60_000),
		});

		const result = await resolveApiKey(
			new Headers({ "x-api-key": key.secret }),
		);
		expect(result.outcome).toBe("expired");
		expect(result.key).toBeNull();
	});

	iit("preserves scopes on resolved key", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({
			organizationId: org.id,
			scopes: ["read:data", "write:links"],
		});

		const result = await resolveApiKey(
			new Headers({ "x-api-key": key.secret }),
		);
		expect(result.outcome).toBe("ok");
		expect(result.key?.scopes).toEqual(["read:data", "write:links"]);
	});
});

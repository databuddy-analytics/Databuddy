import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@databuddy/db", () => ({
	db: {},
	profiles: {},
	profileAliases: {},
	sql: () => {},
}));
vi.mock("@databuddy/redis/rate-limit", () => ({ ratelimit: vi.fn() }));
vi.mock("@lib/request-validation", () => ({
	checkForBot: vi.fn(),
	validateRequest: vi.fn(),
}));
vi.mock("@hooks/auth", () => ({ getWebsiteByIdV2: vi.fn() }));
vi.mock("@lib/api-key", () => ({
	getApiKeyFromHeader: vi.fn(),
	hasWebsiteScope: vi.fn(),
}));
vi.mock("evlog/elysia", () => ({ useLogger: () => ({ set: vi.fn() }) }));

import {
	emailLookupHash,
	protectPii,
	revealPii,
	splitTraits,
} from "@databuddy/services/identity";
import { VALIDATION_LIMITS as SHARED_LIMITS } from "@databuddy/validation";
import type { ApiKeyRow } from "@lib/api-key";
import { hasWebsiteScope } from "@lib/api-key";
import { VALIDATION_LIMITS } from "@utils/validation";
import { denyApiKeyIdentify } from "./identify";

describe("validation limit drift", () => {
	test("profile id cap matches between schema and sanitization", () => {
		expect(VALIDATION_LIMITS.USER_ID_MAX_LENGTH).toBe(
			SHARED_LIMITS.USER_ID_MAX_LENGTH
		);
	});
});

describe("splitTraits", () => {
	test("promotes email, username, and name out of traits", () => {
		const result = splitTraits({
			email: "Jo@Acme.com ",
			username: "jodoe",
			name: "Jo Doe",
			plan: "pro",
		});

		expect(result.email).toBe("jo@acme.com");
		expect(result.displayName).toBe("jodoe");
		expect(result.rest).toEqual({ plan: "pro" });
		expect(result.removeKeys).toEqual([]);
	});

	test("falls back to name when username is absent", () => {
		const result = splitTraits({ name: "Jo Doe" });
		expect(result.displayName).toBe("Jo Doe");
	});

	test("null username falls back to name in the same call", () => {
		const result = splitTraits({ username: null, name: "Jo Doe" });
		expect(result.displayName).toBe("Jo Doe");
	});

	test("null username with no name clears the display name", () => {
		const result = splitTraits({ username: null });
		expect(result.displayName).toBeNull();
	});

	test("null values mark keys for removal", () => {
		const result = splitTraits({ plan: null, seats: 5 });
		expect(result.removeKeys).toEqual(["plan"]);
		expect(result.rest).toEqual({ seats: 5 });
	});

	test("null email clears the column", () => {
		const result = splitTraits({ email: null });
		expect(result.email).toBeNull();
		expect(result.removeKeys).toEqual([]);
	});

	test("display fields stay undefined when not provided", () => {
		const result = splitTraits({ plan: "pro" });
		expect(result.displayName).toBeUndefined();
		expect(result.email).toBeUndefined();
	});

	test("handles missing traits", () => {
		const result = splitTraits(undefined);
		expect(result.rest).toEqual({});
		expect(result.removeKeys).toEqual([]);
		expect(result.displayName).toBeUndefined();
		expect(result.email).toBeUndefined();
	});
});

describe("pii protection", () => {
	const KEY = "test-identity-encryption-key";

	afterEach(() => {
		delete process.env.DATABUDDY_ENCRYPTION_KEY;
	});

	test("encrypts and reveals round-trip when a key is configured", () => {
		process.env.DATABUDDY_ENCRYPTION_KEY = KEY;
		const protectedValue = protectPii("jo@acme.com");
		expect(protectedValue.startsWith("v1:")).toBe(true);
		expect(protectedValue).not.toContain("jo@acme.com");
		expect(revealPii(protectedValue)).toBe("jo@acme.com");
	});

	test("passes plaintext through when no key is configured", () => {
		expect(protectPii("jo@acme.com")).toBe("jo@acme.com");
		expect(revealPii("jo@acme.com")).toBe("jo@acme.com");
		expect(revealPii(null)).toBeNull();
	});

	test("returns null for undecryptable payloads instead of leaking them", () => {
		process.env.DATABUDDY_ENCRYPTION_KEY = KEY;
		const protectedValue = protectPii("jo@acme.com");
		process.env.DATABUDDY_ENCRYPTION_KEY = "different-key";
		expect(revealPii(protectedValue)).toBeNull();
	});

	test("email lookup hash is deterministic and normalized", () => {
		process.env.DATABUDDY_ENCRYPTION_KEY = KEY;
		const hash = emailLookupHash(" Jo@Acme.com ");
		expect(hash).toBe(emailLookupHash("jo@acme.com"));
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toBe(emailLookupHash("other@acme.com"));
	});
});

describe("denyApiKeyIdentify", () => {
	const orgKey = { id: "key_1", organizationId: "org_1" } as ApiKeyRow;
	const website = { organizationId: "org_1" };
	const scopeMock = vi.mocked(hasWebsiteScope);

	test("requires a websiteId", () => {
		expect(denyApiKeyIdentify(orgKey, undefined, null)).toBe(
			"missing_website_id"
		);
	});

	test("requires the track:events scope for the website", () => {
		scopeMock.mockReturnValueOnce(false);
		expect(denyApiKeyIdentify(orgKey, "site_1", website)).toBe(
			"missing_scope"
		);
		expect(scopeMock).toHaveBeenCalledWith(orgKey, "site_1", "track:events");
	});

	test("requires the website to exist", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(denyApiKeyIdentify(orgKey, "site_1", null)).toBe(
			"website_not_found"
		);
	});

	test("rejects websites from another organization", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(
			denyApiKeyIdentify(orgKey, "site_1", { organizationId: "org_2" })
		).toBe("website_scope_mismatch");
	});

	test("rejects keys without an organization", () => {
		scopeMock.mockReturnValueOnce(true);
		const userKey = { id: "key_2", organizationId: null } as ApiKeyRow;
		expect(denyApiKeyIdentify(userKey, "site_1", website)).toBe(
			"website_scope_mismatch"
		);
	});

	test("allows in-org websites with the right scope", () => {
		scopeMock.mockReturnValueOnce(true);
		expect(denyApiKeyIdentify(orgKey, "site_1", website)).toBeNull();
	});
});

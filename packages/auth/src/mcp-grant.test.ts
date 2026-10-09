import "@databuddy/db/test-env";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
	decodeMcpGrantReference,
	encodeMcpGrantReference,
	MCP_GRANT_CLAIM,
} from "@databuddy/shared/mcp-access";
import { mcpAccessTokenClaims, resolveMcpConsent } from "./mcp-grant";

const grant = { organizationId: "organization", websiteIds: ["a", "b"] };
const grantId = "00000000-0000-4000-8000-000000000001";
const referenceId = encodeMcpGrantReference(grant, grantId);
const hash = createHash("sha256").update(referenceId).digest("hex");

describe("MCP consent grants", () => {
	test("canonicalizes websites and gives each authorization a fresh identity", () => {
		expect(
			encodeMcpGrantReference(
				{ organizationId: grant.organizationId, websiteIds: ["b", "a", "b"] },
				grantId
			)
		).toBe(referenceId);
		expect(decodeMcpGrantReference(referenceId)).toEqual(grant);
		expect(mcpAccessTokenClaims({ referenceId })).toEqual({
			[MCP_GRANT_CLAIM]: hash,
		});
		const reconnected = encodeMcpGrantReference(
			grant,
			"00000000-0000-4000-8000-000000000002"
		);
		expect(
			mcpAccessTokenClaims({ referenceId: reconnected })[MCP_GRANT_CLAIM]
		).not.toBe(hash);
		expect(
			resolveMcpConsent(
				[{ referenceId: reconnected, scopes: ["read:data"] }],
				hash,
				["read:data"]
			)
		).toBeNull();
		expect(
			decodeMcpGrantReference(
				encodeMcpGrantReference(
					{ organizationId: "organization", websiteIds: null },
					grantId
				)
			)
		).toEqual({ organizationId: "organization", websiteIds: null });
	});

	test("rejects legacy, malformed, missing, and mismatched grant references", () => {
		for (const invalid of [
			"organization",
			"{",
			JSON.stringify({ version: 1, ...grant }),
			JSON.stringify({
				version: 1,
				grantId,
				organizationId: "organization",
				websiteIds: [],
			}),
			JSON.stringify({ version: 1, grantId, ...grant, unexpected: true }),
		]) {
			expect(decodeMcpGrantReference(invalid)).toBeNull();
			expect(mcpAccessTokenClaims({ referenceId: invalid })).toEqual({});
			expect(
				resolveMcpConsent(
					[{ referenceId: invalid, scopes: ["read:data"] }],
					createHash("sha256").update(invalid).digest("hex"),
					["read:data"]
				)
			).toBeNull();
		}
		expect(mcpAccessTokenClaims({})).toEqual({});
		expect(resolveMcpConsent([], hash, ["read:data"])).toBeNull();
		expect(
			resolveMcpConsent([{ referenceId: null, scopes: ["read:data"] }], hash, [
				"read:data",
			])
		).toBeNull();
		expect(
			resolveMcpConsent(
				[{ referenceId, scopes: ["read:data"] }],
				"other-hash",
				["read:data"]
			)
		).toBeNull();
		expect(
			resolveMcpConsent([{ referenceId, scopes: {} }], hash, ["read:data"])
		).toBeNull();
	});

	test("intersects token scopes with current consent without elevating access", () => {
		expect(
			resolveMcpConsent(
				[{ referenceId, scopes: ["read:data", "manage:websites"] }],
				hash,
				["openid", "read:data", "read:links", "unrecognized"]
			)
		).toEqual({ grant, scopes: ["read:data"] });
		expect(
			resolveMcpConsent([{ referenceId, scopes: [] }], hash, ["read:data"])
		).toEqual({ grant, scopes: [] });
	});

	test("duplicate native consents cannot restore scopes removed by another row", () => {
		expect(
			resolveMcpConsent(
				[
					{ referenceId, scopes: ["read:data", "read:links", "read:links"] },
					{ referenceId, scopes: ["read:data"] },
					{ referenceId: null, scopes: ["manage:websites"] },
				],
				hash,
				["read:data", "read:links"]
			)
		).toEqual({ grant, scopes: ["read:data"] });
	});
});

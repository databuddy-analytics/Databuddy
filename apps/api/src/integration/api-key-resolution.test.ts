import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createMcpTools } from "@databuddy/ai/mcp/tools";
import { auth } from "@databuddy/auth";
import { resolveApiKey } from "@databuddy/api-keys/resolve";
import {
	reset,
	cleanup,
	addToOrganization,
	hasTestDb,
	insertApiKey,
	insertOrganization,
	insertWebsite,
	signUp,
} from "@databuddy/test";
import { Elysia } from "elysia";
import { query } from "../routes/query";

const iit = hasTestDb ? it : it.skip;
const app = new Elysia().use(query);

function postQuery(
	search: string,
	parameters: string[],
	headers: Record<string, string>
) {
	return app.handle(
		new Request(`http://localhost/v1/query${search}`, {
			body: JSON.stringify({
				parameters,
				startDate: "2026-01-01",
				endDate: "2026-01-07",
			}),
			headers: { "content-type": "application/json", ...headers },
			method: "POST",
		})
	);
}

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
			new Headers({ "x-api-key": key.secret })
		);
		expect(result.outcome).toBe("ok");
		expect(result.key?.id).toBe(key.id);
		expect(result.key?.organizationId).toBe(org.id);
	});

	iit("resolves a valid key from Authorization Bearer header", async () => {
		const org = await insertOrganization();
		const key = await insertApiKey({ organizationId: org.id });

		const result = await resolveApiKey(
			new Headers({ authorization: `Bearer ${key.secret}` })
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
			new Headers({ "x-api-key": "not-a-valid-key" })
		);
		expect(result.outcome).toBe("invalid");
		expect(result.key).toBeNull();
	});

	iit("returns invalid for key not in database", async () => {
		const result = await resolveApiKey(
			new Headers({
				"x-api-key": "dbdy_thisKeyDoesNotExistInTheDatabaseAtAll00000000",
			})
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
			new Headers({ "x-api-key": key.secret })
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
			new Headers({ "x-api-key": key.secret })
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
			new Headers({ "x-api-key": key.secret })
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
			new Headers({ "x-api-key": key.secret })
		);
		expect(result.outcome).toBe("ok");
		expect(result.key?.scopes).toEqual(["read:data", "write:links"]);
	});
});

describe("POST /v1/query", () => {
	iit("lets a key limited to one website query only that website", async () => {
		const org = await insertOrganization();
		const siteA = await insertWebsite({ organizationId: org.id });
		const siteB = await insertWebsite({ organizationId: org.id });
		const key = await insertApiKey({
			organizationId: org.id,
			scopes: [],
			metadata: { resources: { [`website:${siteA.id}`]: ["read:data"] } },
		});
		const headers = { "x-api-key": key.secret };

		const own = await postQuery(
			`?website_id=${siteA.id}`,
			["summary_metrics"],
			headers
		);
		expect(own.status).toBe(200);
		const body = await own.json();
		expect(body.success).toBe(true);
		expect(body.data[0].success).toBe(true);

		const otherSite = await postQuery(
			`?website_id=${siteB.id}`,
			["summary_metrics"],
			headers
		);
		expect(otherSite.status).toBe(403);

		const wholeOrg = await postQuery(
			`?organization_id=${org.id}`,
			["summary_metrics"],
			headers
		);
		expect(wholeOrg.status).toBe(403);

		const noId = await postQuery("", ["summary_metrics"], headers);
		expect(noId.status).toBe(400);
		expect((await noId.json()).code).toBe("MISSING_PROJECT_ID");

		const websites = await app.handle(
			new Request("http://localhost/v1/query/websites", { headers })
		);
		expect(websites.status).toBe(200);
		const list: { id: string }[] = (await websites.json()).websites;
		expect(list.map((site) => site.id)).toEqual([siteA.id]);
	});

	iit("rejects error queries on a free plan at every scope", async () => {
		const org = await insertOrganization();
		const site = await insertWebsite({ organizationId: org.id });
		const key = await insertApiKey({
			organizationId: org.id,
			scopes: [],
			metadata: { resources: { global: ["read:data"] } },
		});
		const user = await signUp();
		await addToOrganization(user.id, org.id, "admin");
		await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: user.headers,
		});
		const keyHeaders = { "x-api-key": key.secret };
		const sessionHeaders = { cookie: user.headers.get("cookie") ?? "" };

		const cases = [
			{ search: `?website_id=${site.id}`, headers: keyHeaders },
			{ search: `?organization_id=${org.id}`, headers: keyHeaders },
			{ search: "", headers: keyHeaders },
			{ search: "", headers: sessionHeaders },
		];
		for (const { search, headers } of cases) {
			for (const parameter of ["recent_errors", "error_fingerprints"]) {
				const res = await postQuery(search, [parameter], headers);
				expect(res.status).toBe(402);
				expect((await res.json()).code).toBe("FEATURE_UNAVAILABLE");
			}
		}

		const { key: apiKey } = await resolveApiKey(new Headers(keyHeaders));
		const getData = createMcpTools({
			apiKey,
			organizationId: org.id,
			requestHeaders: new Headers(),
			userId: null,
		}).find((tool) => tool.name === "get_data");
		for (const type of ["recent_errors", "error_fingerprints"]) {
			const result = await getData?.handler({
				preset: "last_7d",
				type,
				websiteId: site.id,
			});
			expect(result?.isError).toBe(true);
			expect(result?.content[0]).toMatchObject({
				text: expect.stringContaining('"code":"plan_limit"'),
			});
		}
	});
});

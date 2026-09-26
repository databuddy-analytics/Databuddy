import "@databuddy/db/test-env";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const integration =
	process.env.MCP_OAUTH_INTEGRATION_TESTS === "true" ? describe : describe.skip;

function base64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

integration("MCP OAuth authorization round trip", () => {
	let auth: typeof import("./oauth").oauthAuth;
	let dbModule: typeof import("@databuddy/db");
	let schema: typeof import("@databuddy/db/schema");
	let config: typeof import("@databuddy/env/app").config;
	const baseURL = "http://localhost:3001";
	const redirectUri = "https://claude.ai/api/mcp/auth_callback";
	const password = "SyntheticTestPassword123!";
	const email = `mcp-oauth-${randomUUID()}@example.com`;
	const createdUserIds: string[] = [];
	let cookie: string;

	beforeAll(async () => {
		process.env.BETTER_AUTH_URL = baseURL;
		dbModule = await import("@databuddy/db");
		schema = await import("@databuddy/db/schema");
		config = (await import("@databuddy/env/app")).config;
		auth = (await import("./oauth")).oauthAuth;

		const signUp = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-up/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: baseURL },
				body: JSON.stringify({ email, password, name: "MCP OAuth" }),
			})
		);
		expect(signUp.status).toBe(200);

		const signIn = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: baseURL },
				body: JSON.stringify({ email, password }),
			})
		);
		expect(signIn.status).toBe(200);
		cookie = signIn.headers.get("set-cookie") ?? "";
		expect(cookie).not.toBe("");

		const created = await dbModule.db.query.user.findFirst({
			where: { email },
			columns: { id: true },
		});
		if (created) {
			createdUserIds.push(created.id);
		}
	});

	afterAll(async () => {
		if (createdUserIds.length > 0) {
			const { db, inArray } = dbModule;
			await db
				.delete(schema.session)
				.where(inArray(schema.session.userId, createdUserIds));
			await db
				.delete(schema.account)
				.where(inArray(schema.account.userId, createdUserIds));
			await db
				.delete(schema.user)
				.where(inArray(schema.user.id, createdUserIds));
		}
		await dbModule.shutdownPostgres();
	});

	test("issues an audience-bound access token through consent and PKCE", async () => {
		const registration = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/create-client`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					client_name: "Round Trip Client",
					redirect_uris: [redirectUri],
				}),
			})
		);
		expect(registration.status).toBeLessThan(300);
		const client = (await registration.json()) as {
			client_id: string;
			client_secret?: string;
		};
		expect(client.client_id).toBeTruthy();

		const codeVerifier = base64Url(randomBytes(32));
		const codeChallenge = base64Url(
			createHash("sha256").update(codeVerifier).digest()
		);
		const authorizeQuery = new URLSearchParams({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			state: "round-trip-state",
			resource: config.urls.mcp,
		});

		const authorize = await auth.handler(
			new Request(
				`${baseURL}/api/auth/oauth2/authorize?${authorizeQuery.toString()}`,
				{ headers: { cookie, origin: baseURL } }
			)
		);
		expect([302, 307]).toContain(authorize.status);
		const consentLocation = authorize.headers.get("location") ?? "";
		expect(consentLocation).toContain("/consent");

		const oauthQuery = consentLocation.split("?")[1] ?? "";
		expect(oauthQuery).not.toBe("");

		const consent = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({ accept: true, oauth_query: oauthQuery }),
			})
		);
		expect(consent.status).toBe(200);
		const { url: callback } = (await consent.json()) as { url: string };
		const code = new URL(callback).searchParams.get("code");
		expect(code).toBeTruthy();

		const tokenBody = new URLSearchParams({
			grant_type: "authorization_code",
			code: code as string,
			redirect_uri: redirectUri,
			client_id: client.client_id,
			code_verifier: codeVerifier,
		});

		const token = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					origin: baseURL,
					authorization: `Basic ${Buffer.from(
						`${client.client_id}:${client.client_secret}`
					).toString("base64")}`,
				},
				body: tokenBody.toString(),
			})
		);
		expect(token.status).toBe(200);
		const issued = (await token.json()) as {
			access_token: string;
			token_type: string;
		};
		expect(issued.token_type.toLowerCase()).toBe("bearer");

		const [, payload] = issued.access_token.split(".");
		const claims = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8")
		) as { aud: string | string[]; iss: string; sub: string };
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		expect(audiences).toContain(config.urls.mcp);
		expect(claims.sub).toBe(createdUserIds[0]);
	});

	test("issues a token to a public client with PKCE and no secret", async () => {
		const registration = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/create-client`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					client_name: "Public Round Trip Client",
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "none",
				}),
			})
		);
		expect(registration.status).toBeLessThan(300);
		const client = (await registration.json()) as {
			client_id: string;
			client_secret?: string;
		};
		expect(client.client_secret).toBeFalsy();

		const codeVerifier = base64Url(randomBytes(32));
		const authorizeQuery = new URLSearchParams({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			code_challenge: base64Url(
				createHash("sha256").update(codeVerifier).digest()
			),
			code_challenge_method: "S256",
			state: "public-client-state",
			resource: config.urls.mcp,
		});

		const authorize = await auth.handler(
			new Request(
				`${baseURL}/api/auth/oauth2/authorize?${authorizeQuery.toString()}`,
				{ headers: { cookie, origin: baseURL } }
			)
		);
		const consentLocation = authorize.headers.get("location") ?? "";
		expect(consentLocation).toContain("/consent");

		const consent = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					accept: true,
					oauth_query: consentLocation.split("?")[1] ?? "",
				}),
			})
		);
		const { url: callback } = (await consent.json()) as { url: string };
		const code = new URL(callback).searchParams.get("code");
		expect(code).toBeTruthy();

		const token = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					origin: baseURL,
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code: code as string,
					redirect_uri: redirectUri,
					client_id: client.client_id,
					code_verifier: codeVerifier,
				}).toString(),
			})
		);
		expect(token.status).toBe(200);
		const issued = (await token.json()) as { access_token: string };
		const [, payload] = issued.access_token.split(".");
		const claims = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8")
		) as { aud: string | string[] };
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		expect(audiences).toContain(config.urls.mcp);
	});

	test("rejects a public client token request that replays a bad verifier", async () => {
		const registration = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/create-client`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					client_name: "PKCE Guard Client",
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "none",
				}),
			})
		);
		const client = (await registration.json()) as { client_id: string };

		const codeVerifier = base64Url(randomBytes(32));
		const authorizeQuery = new URLSearchParams({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			code_challenge: base64Url(
				createHash("sha256").update(codeVerifier).digest()
			),
			code_challenge_method: "S256",
			resource: config.urls.mcp,
		});
		const authorize = await auth.handler(
			new Request(
				`${baseURL}/api/auth/oauth2/authorize?${authorizeQuery.toString()}`,
				{ headers: { cookie, origin: baseURL } }
			)
		);
		const consent = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					accept: true,
					oauth_query: (authorize.headers.get("location") ?? "").split("?")[1],
				}),
			})
		);
		const { url: callback } = (await consent.json()) as { url: string };
		const code = new URL(callback).searchParams.get("code") as string;

		const token = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					origin: baseURL,
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: redirectUri,
					client_id: client.client_id,
					code_verifier: base64Url(randomBytes(32)),
				}).toString(),
			})
		);

		expect(token.status).toBeGreaterThanOrEqual(400);
		expect(
			(await token.json()) as { access_token?: string }
		).not.toHaveProperty("access_token");
	});

	test("publishes authorization server metadata clients discover through", async () => {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/.well-known/oauth-authorization-server`)
		);

		expect(response.status).toBe(200);
		const metadata = (await response.json()) as {
			code_challenge_methods_supported: string[];
			token_endpoint: string;
		};
		expect(metadata.code_challenge_methods_supported).toContain("S256");
		expect(metadata.token_endpoint).toContain("/oauth2/token");
	});

	test("a lost race to seed the MCP resource does not break auth startup", async () => {
		const { db, eq, sql } = dbModule;
		await db
			.delete(schema.oauthResource)
			.where(eq(schema.oauthResource.identifier, config.urls.mcp));

		let started:
			| Promise<
					PromiseSettledResult<
						Awaited<typeof import("./oauth")["oauthAuth"]["$context"]>
					>[]
			  >
			| undefined;
		await db.transaction(async (tx) => {
			await tx.insert(schema.oauthResource).values({
				id: randomUUID(),
				identifier: config.urls.mcp,
				name: config.urls.mcp,
			});
			const modules: typeof import("./oauth")[] = await Promise.all(
				[0, 1].map((index) => import(`./oauth.ts?race=${index}`))
			);
			started = Promise.allSettled(
				modules.map((module) => module.oauthAuth.$context)
			);
			for (let attempt = 0; attempt < 250; attempt++) {
				const blocked = await db.execute<{ count: number }>(
					sql`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like 'insert into "oauth_resource"%'`
				);
				if (blocked.rows[0]?.count === modules.length) {
					return;
				}
				await Bun.sleep(20);
			}
			throw new Error("seed inserts never blocked on the uncommitted row");
		});

		const results = (await started) ?? [];
		expect(results).toHaveLength(2);
		expect(results.filter((result) => result.status === "rejected")).toEqual(
			[]
		);
		const rows = await db
			.select({ id: schema.oauthResource.id })
			.from(schema.oauthResource)
			.where(eq(schema.oauthResource.identifier, config.urls.mcp));
		expect(rows).toHaveLength(1);
	});
});

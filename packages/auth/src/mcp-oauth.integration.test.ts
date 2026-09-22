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
	let auth: typeof import("./auth").auth;
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
		auth = (await import("./auth")).auth;

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
});

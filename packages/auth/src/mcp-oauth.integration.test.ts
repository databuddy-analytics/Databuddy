import "@databuddy/db/test-env";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MCP_GRANT_CLAIM } from "@databuddy/shared/mcp-access";

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
	let getMcpAccessGrant: typeof import("./mcp-grant").getMcpAccessGrant;
	const baseURL = "http://localhost:3001";
	const redirectUri = "https://claude.ai/api/mcp/auth_callback";
	const password = "SyntheticTestPassword123!";
	const email = `mcp-oauth-${randomUUID()}@example.com`;
	const createdUserIds: string[] = [];
	const organizationId = `mcp-oauth-org-${randomUUID()}`;
	const otherOrganizationId = `mcp-oauth-other-org-${randomUUID()}`;
	const websiteId = `mcp-oauth-site-${randomUUID()}`;
	const otherWebsiteId = `mcp-oauth-other-site-${randomUUID()}`;
	let cookie: string;

	beforeAll(async () => {
		process.env.BETTER_AUTH_URL = baseURL;
		dbModule = await import("@databuddy/db");
		schema = await import("@databuddy/db/schema");
		config = (await import("@databuddy/env/app")).config;
		auth = (await import("./oauth")).oauthAuth;
		({ getMcpAccessGrant } = await import("./mcp-grant"));

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
		if (!created) {
			throw new Error("Synthetic user was not created");
		}
		createdUserIds.push(created.id);
		const now = new Date();
		await dbModule.db.insert(schema.organization).values([
			{ id: organizationId, name: "MCP organization", createdAt: now },
			{
				id: otherOrganizationId,
				name: "Other MCP organization",
				createdAt: now,
			},
		]);
		await dbModule.db.insert(schema.member).values(
			[organizationId, otherOrganizationId].map((id) => ({
				id: randomUUID(),
				organizationId: id,
				userId: created.id,
				role: "owner",
				createdAt: now,
			}))
		);
		await dbModule.db.insert(schema.websites).values([
			{ id: websiteId, domain: "mcp.example.com", organizationId },
			{
				id: otherWebsiteId,
				domain: "other-mcp.example.com",
				organizationId: otherOrganizationId,
			},
		]);
	});

	afterAll(async () => {
		if (createdUserIds.length > 0) {
			const { db, inArray } = dbModule;
			await db
				.delete(schema.websites)
				.where(inArray(schema.websites.id, [websiteId, otherWebsiteId]));
			await db
				.delete(schema.organization)
				.where(
					inArray(schema.organization.id, [organizationId, otherOrganizationId])
				);
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

	test("narrows token scopes and binds consent to the chosen organization and website", async () => {
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
			scope: "read:data read:links manage:websites offline_access",
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
				body: JSON.stringify({
					accept: true,
					oauth_query: oauthQuery,
					organizationId,
					websiteIds: [websiteId],
					scope: "read:data offline_access",
				}),
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
		) as {
			aud: string | string[];
			azp: string;
			iss: string;
			sub: string;
			scope: string;
			[MCP_GRANT_CLAIM]: string;
		};
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		expect(audiences).toContain(config.urls.mcp);
		expect(claims.sub).toBe(createdUserIds[0]);
		expect(claims.azp).toBe(client.client_id);
		expect(claims.scope.split(" ").sort()).toEqual([
			"offline_access",
			"read:data",
		]);
		const hash = claims[MCP_GRANT_CLAIM];
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(
			await getMcpAccessGrant(
				claims.sub,
				client.client_id,
				hash,
				claims.scope.split(" ")
			)
		).toEqual({
			grant: { organizationId, websiteIds: [websiteId] },
			scopes: ["read:data"],
		});
		for (const [userId, clientId, grantHash] of [
			[randomUUID(), client.client_id, hash],
			[claims.sub, randomUUID(), hash],
			[claims.sub, client.client_id, "unrelated-grant"],
		]) {
			expect(
				await getMcpAccessGrant(userId, clientId, grantHash, ["read:data"])
			).toBeNull();
		}
	});

	test("preserves grants through refresh, disconnects the app, and isolates reconnects", async () => {
		const clients: string[] = [];
		for (const name of ["Scoped Public Client", "Unrelated Public Client"]) {
			const registration = await auth.handler(
				new Request(`${baseURL}/api/auth/oauth2/create-client`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: baseURL,
						cookie,
					},
					body: JSON.stringify({
						client_name: name,
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
			clients.push(client.client_id);
		}

		const grants = [
			{ organizationId, websiteIds: [websiteId] },
			{ organizationId: otherOrganizationId, websiteIds: [otherWebsiteId] },
			{ organizationId, websiteIds: null },
			{ organizationId, websiteIds: [websiteId] },
		];
		const issued: { clientId: string; hash: string; refreshToken: string }[] =
			[];
		for (const [index, grant] of grants.entries()) {
			const clientId = clients[index === 2 ? 1 : 0];
			const codeVerifier = base64Url(randomBytes(32));
			const authorizeQuery = new URLSearchParams({
				client_id: clientId,
				response_type: "code",
				redirect_uri: redirectUri,
				code_challenge: base64Url(
					createHash("sha256").update(codeVerifier).digest()
				),
				code_challenge_method: "S256",
				state: `public-client-${index}`,
				scope: "read:data offline_access",
				resource: config.urls.mcp,
			});
			const authorize = await auth.handler(
				new Request(`${baseURL}/api/auth/oauth2/authorize?${authorizeQuery}`, {
					headers: { cookie, origin: baseURL },
				})
			);
			expect(authorize.headers.get("location")).toContain("/consent");
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
						oauth_query: (authorize.headers.get("location") ?? "").split(
							"?"
						)[1],
						...grant,
					}),
				})
			);
			expect(consent.status).toBe(200);
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
						client_id: clientId,
						code_verifier: codeVerifier,
					}).toString(),
				})
			);
			expect(token.status).toBe(200);
			const initial = (await token.json()) as {
				access_token: string;
				refresh_token: string;
			};
			const refreshed = await auth.handler(
				new Request(`${baseURL}/api/auth/oauth2/token`, {
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						origin: baseURL,
					},
					body: new URLSearchParams({
						grant_type: "refresh_token",
						refresh_token: initial.refresh_token,
						client_id: clientId,
						resource: config.urls.mcp,
					}).toString(),
				})
			);
			expect(refreshed.status).toBe(200);
			const renewed = (await refreshed.json()) as {
				access_token: string;
				refresh_token: string;
			};
			let hash = "";
			for (const accessToken of [initial.access_token, renewed.access_token]) {
				const [, payload] = accessToken.split(".");
				const claims = JSON.parse(
					Buffer.from(payload, "base64url").toString("utf8")
				) as {
					aud: string | string[];
					azp: string;
					scope: string;
					[MCP_GRANT_CLAIM]: string;
				};
				expect(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).toContain(
					config.urls.mcp
				);
				expect(claims.azp).toBe(clientId);
				if (hash) {
					expect(claims[MCP_GRANT_CLAIM]).toBe(hash);
				}
				hash = claims[MCP_GRANT_CLAIM];
				expect(
					await getMcpAccessGrant(
						createdUserIds[0],
						clientId,
						hash,
						claims.scope.split(" ")
					)
				).toEqual({ grant, scopes: ["read:data"] });
			}
			issued.push({ clientId, hash, refreshToken: renewed.refresh_token });
			if (index === 2) {
				const consents = await dbModule.db
					.select()
					.from(schema.oauthConsent)
					.where(
						dbModule.and(
							dbModule.eq(schema.oauthConsent.userId, createdUserIds[0]),
							dbModule.eq(schema.oauthConsent.clientId, clients[0])
						)
					);
				expect(consents).toHaveLength(2);
				const disconnect = await auth.handler(
					new Request(`${baseURL}/api/auth/oauth2/delete-consent`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							origin: baseURL,
							cookie,
						},
						body: JSON.stringify({ id: consents[0].id }),
					})
				);
				expect(disconnect.status).toBe(200);
				for (const connection of issued) {
					const access = await getMcpAccessGrant(
						createdUserIds[0],
						connection.clientId,
						connection.hash,
						["read:data"]
					);
					const unrelated = connection.clientId === clients[1];
					if (unrelated) {
						expect(access?.grant).toEqual(grants[2]);
					} else {
						expect(access).toBeNull();
					}
					const refresh = await auth.handler(
						new Request(`${baseURL}/api/auth/oauth2/token`, {
							method: "POST",
							headers: {
								"content-type": "application/x-www-form-urlencoded",
								origin: baseURL,
							},
							body: new URLSearchParams({
								grant_type: "refresh_token",
								refresh_token: connection.refreshToken,
								client_id: connection.clientId,
								resource: config.urls.mcp,
							}).toString(),
						})
					);
					if (unrelated) {
						expect(refresh.status).toBe(200);
					} else {
						expect(refresh.status).toBeGreaterThanOrEqual(400);
						expect(await refresh.json()).not.toHaveProperty("access_token");
					}
				}
			}
		}
		expect(issued[3].hash).not.toBe(issued[0].hash);
		for (const old of issued.slice(0, 2)) {
			expect(
				await getMcpAccessGrant(createdUserIds[0], old.clientId, old.hash, [
					"read:data",
				])
			).toBeNull();
		}
	});

	test("rejects invalid selections, scope elevation, and a tampered authorization query", async () => {
		const registration = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/create-client`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({
					client_name: "Consent Validation Client",
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "none",
				}),
			})
		);
		expect(registration.status).toBeLessThan(300);
		const { client_id: clientId } = (await registration.json()) as {
			client_id: string;
		};
		const query = new URLSearchParams({
			client_id: clientId,
			response_type: "code",
			redirect_uri: redirectUri,
			code_challenge: base64Url(
				createHash("sha256")
					.update(base64Url(randomBytes(32)))
					.digest()
			),
			code_challenge_method: "S256",
			scope: "read:data",
			resource: config.urls.mcp,
		});
		const authorize = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/authorize?${query}`, {
				headers: { cookie, origin: baseURL },
			})
		);
		const oauthQuery = (authorize.headers.get("location") ?? "").split("?")[1];
		expect(oauthQuery).toBeTruthy();
		const tampered = new URLSearchParams(oauthQuery);
		tampered.set("scope", "read:data manage:websites");
		for (const invalid of [
			{},
			{ organizationId },
			{ organizationId, websiteIds: [] },
			{ organizationId: randomUUID(), websiteIds: null },
			{ organizationId, websiteIds: [otherWebsiteId] },
			{ organizationId, websiteIds: [randomUUID()] },
			{
				organizationId,
				websiteIds: [websiteId],
				scope: "read:data manage:websites",
			},
			{
				organizationId,
				websiteIds: [websiteId],
				oauth_query: tampered.toString(),
			},
		]) {
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
						oauth_query: oauthQuery,
						...invalid,
					}),
				})
			);
			expect(consent.status).toBeGreaterThanOrEqual(400);
			expect(await consent.json()).not.toHaveProperty("url");
		}
		expect(
			await dbModule.db
				.select()
				.from(schema.oauthConsent)
				.where(dbModule.eq(schema.oauthConsent.clientId, clientId))
		).toEqual([]);
		const denied = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
					cookie,
				},
				body: JSON.stringify({ accept: false, oauth_query: oauthQuery }),
			})
		);
		expect(denied.status).toBe(200);
		const { url } = (await denied.json()) as { url: string };
		expect(new URL(url).searchParams.get("error")).toBe("access_denied");
		expect(new URL(url).searchParams.has("code")).toBe(false);
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
					organizationId,
					websiteIds: [websiteId],
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

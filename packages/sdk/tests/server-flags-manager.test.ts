import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { FlagResult, FlagsConfig } from "../src/core/flags/types";
import { FlagsRequestError } from "../src/core/flags/shared";
import { createServerFlagsManager } from "../src/node/flags/flags-manager";
import { ServerFlagsManager } from "../src/node/flags/flags-manager";

const FLAG_ENABLED: FlagResult = {
	enabled: true,
	value: true,
	payload: null,
	reason: "MATCH",
};

const FLAG_DISABLED: FlagResult = {
	enabled: false,
	value: false,
	payload: null,
	reason: "DEFAULT",
};

const FLAG_VARIANT: FlagResult = {
	enabled: true,
	value: "treatment-a",
	payload: null,
	reason: "MULTIVARIANT_EVALUATED",
	variant: "treatment-a",
};

const DEFAULT_FLAGS: Record<string, FlagResult> = {
	"feature-on": FLAG_ENABLED,
	"feature-off": FLAG_DISABLED,
	"feature-variant": FLAG_VARIANT,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockFetch(flagsResponse: Record<string, FlagResult> = DEFAULT_FLAGS) {
	const calls: string[] = [];
	const bodies: Array<Record<string, unknown>> = [];
	const originalFetch = globalThis.fetch;

	globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		calls.push(url);
		const body =
			typeof init?.body === "string"
				? (JSON.parse(init.body) as Record<string, unknown>)
				: {};
		bodies.push(body);
		const keys = Array.isArray(body.keys) ? body.keys : null;

		if (keys) {
			const filtered = Object.fromEntries(
				keys.map((key) => [
					String(key),
					flagsResponse[String(key)] ?? FLAG_DISABLED,
				])
			);
			return new Response(JSON.stringify({ flags: filtered }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ flags: flagsResponse }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof fetch;

	return {
		bodies,
		calls,
		restore: () => {
			globalThis.fetch = originalFetch;
		},
	};
}

describe("ServerFlagsManager", () => {
	let fetchMock: ReturnType<typeof mockFetch>;
	const managers: ServerFlagsManager[] = [];

	async function create(
		config: FlagsConfig,
		raw = false
	): Promise<ServerFlagsManager> {
		const manager = raw
			? new ServerFlagsManager({ config })
			: createServerFlagsManager(config);
		managers.push(manager);
		await manager.waitForInit();
		return manager;
	}

	beforeEach(() => {
		fetchMock = mockFetch();
	});

	afterEach(() => {
		for (const m of managers) {
			m.destroy();
		}
		managers.length = 0;
		fetchMock.restore();
	});

	describe("createServerFlagsManager", () => {
		it("returns a ServerFlagsManager instance", async () => {
			const manager = await create({ clientId: "test-id" });
			expect(manager).toBeInstanceOf(ServerFlagsManager);
		});
	});

	describe("initialization", () => {
		it("defaults autoFetch to false", async () => {
			await create({ clientId: "test-id" }, true);
			expect(fetchMock.calls.length).toBe(0);
		});

		it("fetches all flags on init when autoFetch is true", async () => {
			await create({ clientId: "test-id", autoFetch: true }, true);

			expect(fetchMock.calls.length).toBeGreaterThanOrEqual(1);
			expect(fetchMock.calls.at(0)).toContain("/public/v1/flags/bulk");
		});

		it("forces skipStorage to true", async () => {
			const manager = await create(
				{ clientId: "test-id", skipStorage: false },
				true
			);
			expect(manager.isReady()).toBe(true);
		});

		it("reaches ready state after waitForInit", async () => {
			const manager = await create(
				{ clientId: "test-id", autoFetch: true },
				true
			);
			expect(manager.isReady()).toBe(true);
		});
	});

	describe("getFlag", () => {
		it("fetches and returns an enabled flag", async () => {
			const manager = await create({ clientId: "test-id" });

			const result = await manager.getFlag("feature-on");
			expect(result.enabled).toBe(true);
			expect(result.value).toBe(true);
			expect(result.reason).toBe("MATCH");
		});

		it("fetches and returns a disabled flag", async () => {
			const manager = await create({ clientId: "test-id" });

			const result = await manager.getFlag("feature-off");
			expect(result.enabled).toBe(false);
			expect(result.value).toBe(false);
		});

		it("returns variant flag with value and variant name", async () => {
			const manager = await create({ clientId: "test-id" });

			const result = await manager.getFlag("feature-variant");
			expect(result.enabled).toBe(true);
			expect(result.value).toBe("treatment-a");
			expect(result.variant).toBe("treatment-a");
		});

		it("returns default when disabled", async () => {
			const manager = await create({
				clientId: "test-id",
				disabled: true,
			});

			const result = await manager.getFlag("feature-on");
			expect(result.enabled).toBe(false);
			expect(result.reason).toBe("DEFAULT");
		});

		it("returns pending when isPending is true", async () => {
			const manager = await create({
				clientId: "test-id",
				isPending: true,
			});

			const result = await manager.getFlag("feature-on");
			expect(result.enabled).toBe(false);
			expect(result.reason).toBe("SESSION_PENDING");
		});

		it("uses per-call user context for cache key isolation", async () => {
			const manager = await create({
				clientId: "test-id",
				user: { userId: "global-user" },
			});

			const [resultA, resultB] = await Promise.all([
				manager.getFlag("feature-on", { userId: "user-a" }),
				manager.getFlag("feature-on", { userId: "user-b" }),
			]);

			expect(resultA.enabled).toBe(true);
			expect(resultB.enabled).toBe(true);
			expect(fetchMock.bodies.some((body) => body.userId === "user-a")).toBe(
				true
			);
			expect(fetchMock.bodies.some((body) => body.userId === "user-b")).toBe(
				true
			);
			expect(
				fetchMock.bodies.some((body) => body.userId === "global-user")
			).toBe(false);
			expect(fetchMock.calls.some((url) => url.includes("userId="))).toBe(
				false
			);
		});

		it("isolates cache by organization context", async () => {
			fetchMock.restore();
			const calls: string[] = [];
			globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				calls.push(url);
				const body =
					typeof init?.body === "string"
						? (JSON.parse(init.body) as Record<string, unknown>)
						: {};
				const orgId = body.organizationId;
				return new Response(
					JSON.stringify({
						flags: {
							"org-rollout":
								orgId === "org-a" ? FLAG_ENABLED : FLAG_DISABLED,
						},
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				);
			}) as typeof fetch;

			const manager = await create({ clientId: "test-id" });

			const resultA = await manager.getFlag("org-rollout", {
				organizationId: "org-a",
			});
			const resultB = await manager.getFlag("org-rollout", {
				organizationId: "org-b",
			});

			expect(resultA.enabled).toBe(true);
			expect(resultB.enabled).toBe(false);
			expect(calls).toHaveLength(2);
		});
	});

	describe("request batching", () => {
		it("batches concurrent getFlag calls into a single bulk request", async () => {
			const manager = await create({ clientId: "test-id" });

			const [a, b, c] = await Promise.all([
				manager.getFlag("feature-on"),
				manager.getFlag("feature-off"),
				manager.getFlag("feature-variant"),
			]);

			expect(a.enabled).toBe(true);
			expect(b.enabled).toBe(false);
			expect(c.variant).toBe("treatment-a");

			const bulkCalls = fetchMock.calls.filter((url) => url.includes("/bulk"));
			expect(bulkCalls.length).toBe(1);

			const keys = fetchMock.bodies.find((body) => Array.isArray(body.keys))
				?.keys as string[] | undefined;
			expect(keys?.length).toBe(3);
			expect(keys).toContain("feature-on");
			expect(keys).toContain("feature-off");
			expect(keys).toContain("feature-variant");
		});

		it("uses 5ms batch delay (shorter than browser default)", async () => {
			const manager = await create({ clientId: "test-id" }, true);

			const start = performance.now();
			await manager.getFlag("feature-on");
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(200);
		});
	});

	describe("caching", () => {
		it("serves cached result without re-fetching", async () => {
			const manager = await create({
				clientId: "test-id",
				cacheTtl: 60_000,
				staleTime: 30_000,
			});

			await manager.getFlag("feature-on");
			const callsBefore = fetchMock.calls.length;

			await manager.getFlag("feature-on");
			await manager.getFlag("feature-on");

			expect(fetchMock.calls.length).toBe(callsBefore);
		});

		it("serves stale data while re-fetching after cache expiry", async () => {
			const manager = await create({
				clientId: "test-id",
				cacheTtl: 30,
				staleTime: 15,
			});

			await manager.getFlag("feature-on");
			const callsAfterFirst = fetchMock.calls.length;

			await sleep(50);

			const stale = await manager.getFlag("feature-on");
			expect(stale.enabled).toBe(true);
			await sleep(20);
			expect(fetchMock.calls.length).toBeGreaterThan(callsAfterFirst);
		});

		it("getMemoryFlags returns all cached flags", async () => {
			const manager = await create({
				clientId: "test-id",
				autoFetch: true,
			});

			const flags = manager.getMemoryFlags();
			expect(flags["feature-on"]).toBeDefined();
			expect(flags["feature-on"].enabled).toBe(true);
			expect(flags["feature-off"]).toBeDefined();
			expect(flags["feature-off"].enabled).toBe(false);
		});

		it("caps the in-memory flag cache", async () => {
			const manager = await create({
				clientId: "test-id",
				autoFetch: false,
				maxCacheSize: 2,
			});

			await manager.getFlag("feature-on", { userId: "user-1" });
			await manager.getFlag("feature-off", { userId: "user-2" });
			await manager.getFlag("feature-variant", { userId: "user-3" });

			expect(Object.keys(manager.getMemoryFlags()).length).toBeLessThanOrEqual(
				2
			);
		});
	});

	describe("user context", () => {
		it("sends userId and email in the POST body, not the URL", async () => {
			const manager = await create({
				clientId: "test-id",
				user: { userId: "user-123", email: "test@example.com" },
			});

			await manager.getFlag("feature-on");
			await sleep(20);

			const hasUser = fetchMock.bodies.some(
				(body) =>
					body.userId === "user-123" && body.email === "test@example.com"
			);
			expect(hasUser).toBe(true);
			expect(fetchMock.calls.some((url) => url.includes("test%40"))).toBe(false);
		});

		it("sends organizationId and teamId", async () => {
			const manager = await create({
				clientId: "test-id",
				user: { organizationId: "org-1", teamId: "team-1" },
			});

			await manager.getFlag("feature-on");
			await sleep(20);

			const hasOrgTeam = fetchMock.bodies.some(
				(body) =>
					body.organizationId === "org-1" && body.teamId === "team-1"
			);
			expect(hasOrgTeam).toBe(true);
		});

		it("sends environment in the POST body", async () => {
			const manager = await create({
				clientId: "test-id",
				environment: "staging",
			});

			await manager.getFlag("feature-on");
			await sleep(20);

			const hasEnv = fetchMock.bodies.some(
				(body) => body.environment === "staging"
			);
			expect(hasEnv).toBe(true);
		});

		it("updateUser triggers fresh fetch with new user", async () => {
			const manager = await create({
				clientId: "test-id",
				user: { userId: "user-1" },
				autoFetch: true,
			});

			manager.updateUser({ userId: "user-2" });
			await sleep(100);

			const hasUser2 = fetchMock.bodies.some(
				(body) => body.userId === "user-2"
			);
			expect(hasUser2).toBe(true);
		});

		it("removes prior-user flags after a successful identity switch", async () => {
			fetchMock.restore();
			const bodies: Array<Record<string, unknown>> = [];
			globalThis.fetch = mock(
				async (_input: string | URL | Request, init?: RequestInit) => {
					const body =
						typeof init?.body === "string"
							? (JSON.parse(init.body) as Record<string, unknown>)
							: {};
					bodies.push(body);
					const flags =
						body.userId === "user-a"
							? {
									"user-a-only": {
										...FLAG_ENABLED,
										payload: { audience: "user-a" },
									},
								}
							: {};
					return Response.json({ flags });
				}
			) as typeof fetch;

			const manager = await create({
				clientId: "test-id",
				user: { userId: "user-a" },
				autoFetch: true,
			});
			expect(manager.getSnapshot().flags["user-a-only"]).toBeDefined();

			manager.updateUser({ userId: "user-b" });
			await sleep(50);

			expect(bodies.some((body) => body.userId === "user-b")).toBe(true);
			expect(manager.getSnapshot().flags["user-a-only"]).toBeUndefined();
			expect(manager.getMemoryFlags()["user-a-only"]).toBeUndefined();
			expect(manager.getLastError()).toBeNull();
		});

		it("does not expose prior-user flags when the new identity fetch fails", async () => {
			fetchMock.restore();
			globalThis.fetch = mock(
				async (_input: string | URL | Request, init?: RequestInit) => {
					const body =
						typeof init?.body === "string"
							? (JSON.parse(init.body) as Record<string, unknown>)
							: {};
					if (body.userId === "user-b") {
						return Response.json(
							{ error: "Flag service unavailable" },
							{ status: 503 }
						);
					}
					return Response.json({
						flags: {
							"user-a-only": {
								...FLAG_ENABLED,
								payload: { audience: "user-a" },
							},
						},
					});
				}
			) as typeof fetch;

			const manager = await create({
				clientId: "test-id",
				user: { userId: "user-a" },
				autoFetch: true,
			});
			expect(manager.getSnapshot().flags["user-a-only"]).toBeDefined();

			manager.updateUser({ userId: "user-b" });
			await sleep(50);

			expect(manager.getSnapshot().flags["user-a-only"]).toBeUndefined();
			expect(manager.getMemoryFlags()["user-a-only"]).toBeUndefined();
			expect(manager.getLastError()).toMatchObject({
				status: 503,
				retryable: true,
			});
		});

		it("clears and fetches again when the environment changes", async () => {
			fetchMock.restore();
			const environments: unknown[] = [];
			globalThis.fetch = mock(
				async (_input: string | URL | Request, init?: RequestInit) => {
					const body =
						typeof init?.body === "string"
							? (JSON.parse(init.body) as Record<string, unknown>)
							: {};
					environments.push(body.environment);
					return Response.json({
						flags:
							body.environment === "staging"
								? { "staging-only": FLAG_ENABLED }
								: {},
					});
				}
			) as typeof fetch;

			const manager = await create({
				clientId: "test-id",
				environment: "staging",
				autoFetch: true,
			});
			expect(manager.getSnapshot().flags["staging-only"]).toBeDefined();

			manager.updateConfig({ clientId: "test-id", environment: "production" });
			await sleep(50);

			expect(environments).toContain("production");
			expect(manager.getSnapshot().flags["staging-only"]).toBeUndefined();
		});

		it("ignores an old identity response that finishes after a switch", async () => {
			fetchMock.restore();
			let markUserAStarted: () => void;
			const userAStarted = new Promise<void>((resolve) => {
				markUserAStarted = resolve;
			});
			let resolveUserA: (response: Response) => void;
			const userAResponse = new Promise<Response>((resolve) => {
				resolveUserA = resolve;
			});
			globalThis.fetch = mock(
				async (_input: string | URL | Request, init?: RequestInit) => {
					const body =
						typeof init?.body === "string"
							? (JSON.parse(init.body) as Record<string, unknown>)
							: {};
					if (body.userId === "user-a") {
						markUserAStarted();
						return userAResponse;
					}
					return Response.json({ flags: { "user-b-only": FLAG_ENABLED } });
				}
			) as typeof fetch;

			const manager = new ServerFlagsManager({
				config: {
					clientId: "test-id",
					user: { userId: "user-a" },
					autoFetch: true,
				},
			});
			managers.push(manager);
			await userAStarted;

			manager.updateUser({ userId: "user-b" });
			await sleep(20);
			resolveUserA(
				Response.json({ flags: { "user-a-only": FLAG_ENABLED } })
			);
			await manager.waitForInit();
			await sleep(20);

			expect(manager.getSnapshot().flags["user-a-only"]).toBeUndefined();
			expect(manager.getSnapshot().flags["user-b-only"]).toBeDefined();
		});
	});

	describe("refresh", () => {
		it("re-fetches all flags", async () => {
			const manager = await create({
				clientId: "test-id",
				autoFetch: true,
			});
			const callsAfterInit = fetchMock.calls.length;

			await manager.refresh();
			expect(fetchMock.calls.length).toBeGreaterThan(callsAfterInit);
		});

		it("forceClear clears cache before re-fetch", async () => {
			const manager = await create({
				clientId: "test-id",
				autoFetch: true,
			});

			const flagsBefore = manager.getMemoryFlags();
			expect(Object.keys(flagsBefore).length).toBeGreaterThan(0);

			await manager.refresh(true);

			const flagsAfter = manager.getMemoryFlags();
			expect(Object.keys(flagsAfter).length).toBeGreaterThan(0);
		});
	});

	describe("isEnabled (synchronous)", () => {
		it("returns loading state for uncached flag", async () => {
			const manager = await create({ clientId: "test-id" });

			const state = manager.isEnabled("uncached-flag");
			expect(state.on).toBe(false);
			expect(state.loading).toBe(true);
			expect(state.status).toBe("loading");
		});

		it("returns ready state for cached flag", async () => {
			const manager = await create({ clientId: "test-id" });

			await manager.getFlag("feature-on");
			const state = manager.isEnabled("feature-on");
			expect(state.on).toBe(true);
			expect(state.loading).toBe(false);
			expect(state.status).toBe("ready");
		});
	});

	describe("getValue", () => {
		it("returns cached value", async () => {
			const manager = await create({ clientId: "test-id" });

			await manager.getFlag("feature-variant");
			const value = manager.getValue("feature-variant");
			expect(value).toBe("treatment-a");
		});

		it("returns default for uncached flag", async () => {
			const manager = await create({ clientId: "test-id" });

			const value = manager.getValue("unknown-flag", 42);
			expect(value).toBe(42);
		});

		it("returns config default when no inline default given", async () => {
			const manager = await create({
				clientId: "test-id",
				defaults: { "my-flag": "configured-default" },
			});

			const value = manager.getValue("my-flag");
			expect(value).toBe("configured-default");
		});
	});

	describe("error handling", () => {
		it("throws a typed failure on an initial API error", async () => {
			fetchMock.restore();
			globalThis.fetch = mock(async () => {
				return new Response("Internal Server Error", { status: 500 });
			}) as typeof fetch;

			const manager = await create({ clientId: "test-id" });

			await expect(manager.getFlag("feature-on")).rejects.toBeInstanceOf(
				FlagsRequestError
			);
			expect(manager.getLastError()).toMatchObject({
				code: "HTTP_ERROR",
				status: 500,
				retryable: true,
			});
		});

		it("returns error result on network failure", async () => {
			fetchMock.restore();
			globalThis.fetch = mock(async () => {
				throw new Error("Network error");
			}) as typeof fetch;

			const manager = await create({ clientId: "test-id" });

			await expect(manager.getFlag("feature-on")).rejects.toThrow(
				"Network error"
			);
		});

		it("keeps the last-known value when revalidation fails", async () => {
			const manager = await create({
				clientId: "test-id",
				cacheTtl: 5,
				staleTime: 1,
			});
			const first = await manager.getFlag("feature-on");
			expect(first.enabled).toBe(true);

			fetchMock.restore();
			globalThis.fetch = mock(async () =>
				Response.json(
					{ error: "Flag service unavailable" },
					{ status: 503 }
				)
			) as typeof fetch;
			await sleep(10);

			const stale = await manager.getFlag("feature-on");
			expect(stale).toEqual(first);
			await sleep(20);
			expect(manager.getMemoryFlags()["feature-on"]).toEqual(first);
			expect(manager.getLastError()).toMatchObject({
				status: 503,
				retryable: true,
			});
		});
	});

	describe("destroy", () => {
		it("clears cache and stops batching", async () => {
			const manager = await create({ clientId: "test-id" });

			await manager.getFlag("feature-on");
			expect(Object.keys(manager.getMemoryFlags()).length).toBeGreaterThan(0);

			manager.destroy();

			expect(Object.keys(manager.getMemoryFlags()).length).toBe(0);
		});
	});

	describe("subscribe", () => {
		it("notifies subscribers on flag updates", async () => {
			const manager = await create({ clientId: "test-id" });

			let notified = false;
			const unsub = manager.subscribe(() => {
				notified = true;
			});

			await manager.getFlag("feature-on");
			expect(notified).toBe(true);
			unsub();
		});

		it("returns snapshot with flags and ready state", async () => {
			const manager = await create({
				clientId: "test-id",
				autoFetch: true,
			});

			const snapshot = manager.getSnapshot();
			expect(snapshot.isReady).toBe(true);
			expect(snapshot.flags["feature-on"]).toBeDefined();
		});
	});

	describe("updateConfig", () => {
		it("enables fetching when transitioning from disabled to enabled", async () => {
			const manager = await create({
				clientId: "test-id",
				disabled: true,
			});
			expect(fetchMock.calls.length).toBe(0);

			manager.updateConfig({ clientId: "test-id", disabled: false });
			await sleep(100);

			expect(fetchMock.calls.length).toBeGreaterThanOrEqual(1);
		});

		it("enables fetching when transitioning from pending to active", async () => {
			const manager = await create({
				clientId: "test-id",
				isPending: true,
			});
			expect(fetchMock.calls.length).toBe(0);

			manager.updateConfig({ clientId: "test-id", isPending: false });
			await sleep(100);

			expect(fetchMock.calls.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("evaluation telemetry", () => {
		it("fires onFlagEvaluated on cache hits, not only cache misses", async () => {
			let evalCount = 0;
			class CountingManager extends ServerFlagsManager {
				protected override onFlagEvaluated(): void {
					evalCount += 1;
				}
			}
			const manager = new CountingManager({ config: { clientId: "test-id" } });
			managers.push(manager);
			await manager.waitForInit();

			await manager.getFlag("feature-on"); // cache miss -> fetch -> fires
			await manager.getFlag("feature-on"); // cache hit -> must also fire

			expect(evalCount).toBe(2);
		});
	});
});

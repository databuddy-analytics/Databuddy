import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

interface SqlFragment {
	text: string;
	values: unknown[];
}

const calls: string[] = [];
const findApiKey = mock((_input?: unknown): Promise<unknown> =>
	Promise.resolve(null)
);
const execute = mock(async (_query: SqlFragment) => {
	calls.push("statement-timeout");
});
const redisSet = mock((): Promise<string | null> => Promise.resolve("OK"));
const tx = {
	execute,
	query: {
		apikey: {
			findFirst: (...args: unknown[]) => {
				calls.push("lookup");
				return findApiKey(args[0]);
			},
		},
	},
};
const transaction = mock(
	async (work: (value: typeof tx) => Promise<unknown>): Promise<unknown> => {
		calls.push("transaction");
		return work(tx);
	}
);

let configuredQueryTimeoutMs: number | undefined;
let queryTimeoutOverrideMs: number | undefined;

mock.module("@databuddy/db", () => ({
	db: {
		transaction,
		update: () => ({
			set: () => ({ where: () => Promise.resolve() }),
		}),
	},
	eq: (left: unknown, right: unknown) => [left, right],
	sql: (strings: TemplateStringsArray, ...values: unknown[]): SqlFragment => ({
		text: strings.join("?"),
		values,
	}),
}));

mock.module("@databuddy/db/schema", () => ({
	apikey: { id: "id" },
}));

mock.module("@databuddy/redis", () => ({
	cacheNamespaces: { apiKeyByHash: "api-key-by-hash" },
	cacheable: (
		lookup: (...args: string[]) => Promise<unknown>,
		options: { queryTimeoutMs?: number }
	) => {
		configuredQueryTimeoutMs = options.queryTimeoutMs;
		const inFlight = new Map<string, Promise<unknown>>();
		const cached = (...args: string[]): Promise<unknown> => {
			const key = JSON.stringify(args);
			const existing = inFlight.get(key);
			if (existing) {
				return existing;
			}

			const raw = lookup(...args);
			const timeoutMs = queryTimeoutOverrideMs ?? options.queryTimeoutMs;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const bounded =
				timeoutMs === undefined
					? raw
					: Promise.race([
							raw,
							new Promise<never>((_, reject) => {
								timer = setTimeout(
									() => reject(new Error("Query timeout")),
									timeoutMs
								);
							}),
						]);
			const shared = bounded.finally(() => {
				if (timer) {
					clearTimeout(timer);
				}
				inFlight.delete(key);
			});
			inFlight.set(key, shared);
			return shared;
		};
		return Object.assign(cached, {
			invalidate: () => Promise.resolve(),
		});
	},
	redis: { set: redisSet },
}));

const {
	API_KEY_LOOKUP_TIMEOUT_MS,
	API_KEY_STATEMENT_TIMEOUT_MS,
	resolveApiKeySecret,
} = await import("./resolve");

describe("API key database deadline", () => {
	beforeEach(() => {
		calls.length = 0;
		execute.mockClear();
		findApiKey.mockReset();
		findApiKey.mockResolvedValue(null);
		transaction.mockClear();
		queryTimeoutOverrideMs = undefined;
	});

	afterAll(() => {
		mock.restore();
	});

	test("sets a transaction-local PostgreSQL statement timeout before lookup", async () => {
		await expect(
			resolveApiKeySecret("dbdy_valid_test_key")
		).resolves.toMatchObject({ outcome: "invalid" });

		expect(API_KEY_STATEMENT_TIMEOUT_MS).toBe(5000);
		expect(API_KEY_LOOKUP_TIMEOUT_MS).toBe(5000);
		expect(configuredQueryTimeoutMs).toBe(API_KEY_LOOKUP_TIMEOUT_MS);
		expect(calls).toEqual(["transaction", "statement-timeout", "lookup"]);
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(execute).toHaveBeenCalledTimes(1);

		const statement = execute.mock.calls[0]?.[0];
		expect(statement?.text).toContain("set_config('statement_timeout'");
		expect(statement?.text).toContain(", true)");
		expect(statement?.values).toEqual([
			String(API_KEY_STATEMENT_TIMEOUT_MS),
		]);
	});

	test("releases the shared lookup after PostgreSQL cancels the statement", async () => {
		const timeout = Object.assign(
			new Error("canceling statement due to statement timeout"),
			{ code: "57014" }
		);
		findApiKey.mockRejectedValueOnce(timeout);

		const first = resolveApiKeySecret("dbdy_stalled_lookup");
		const shared = resolveApiKeySecret("dbdy_stalled_lookup");

		const results = await Promise.allSettled([first, shared]);
		expect(results).toEqual([
			{ status: "rejected", reason: timeout },
			{ status: "rejected", reason: timeout },
		]);
		expect(findApiKey).toHaveBeenCalledTimes(1);

		await expect(
			resolveApiKeySecret("dbdy_stalled_lookup")
		).resolves.toMatchObject({ outcome: "invalid" });
		expect(findApiKey).toHaveBeenCalledTimes(2);
	});

	test("bounds pool acquisition before the transaction callback starts and retries", async () => {
		queryTimeoutOverrideMs = 10;
		transaction.mockImplementationOnce(
			() => new Promise<never>(() => undefined)
		);

		await expect(
			resolveApiKeySecret("dbdy_waiting_for_pool")
		).rejects.toThrow("Query timeout");
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(execute).not.toHaveBeenCalled();
		expect(findApiKey).not.toHaveBeenCalled();

		await expect(
			resolveApiKeySecret("dbdy_waiting_for_pool")
		).resolves.toMatchObject({ outcome: "invalid" });
		expect(transaction).toHaveBeenCalledTimes(2);
		expect(findApiKey).toHaveBeenCalledTimes(1);
	});
});

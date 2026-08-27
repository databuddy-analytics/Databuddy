import { afterEach, describe, expect, it, mock } from "bun:test";
import {
	isDefinitiveAutumnBalanceFailure,
	updateAutumnBalance,
} from "./autumn-balance";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("updateAutumnBalance", () => {
	it("posts the balance update with a redemption-scoped idempotency key", async () => {
		const fetchMock = mock(async (_url: string | URL | Request, _init?: RequestInit) =>
			new Response("{}", { status: 200 })
		);
		globalThis.fetch = fetchMock as typeof fetch;

		await updateAutumnBalance({
			amount: 2500,
			customerId: "cus_1",
			featureId: "events",
			redemptionId: "redemption-1",
			secretKey: "secret",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.useautumn.com/v1/balances.update");
		expect(init?.method).toBe("POST");
		expect(init?.headers).toMatchObject({
			Authorization: "Bearer secret",
			"Content-Type": "application/json",
			"Idempotency-Key": "feedback-redemption:redemption-1",
		});
		expect(JSON.parse(String(init?.body))).toEqual({
			customer_id: "cus_1",
			feature_id: "events",
			add_to_balance: 2500,
		});
	});

	it.each([
		[400, true],
		[499, true],
		[500, false],
		[503, false],
	])(
		"treats an HTTP %i Autumn response as definitive=%p for rollback",
		async (status, definitive) => {
			globalThis.fetch = mock(
				async () => new Response("autumn error", { status })
			) as typeof fetch;

			let error: unknown;
			try {
				await updateAutumnBalance({
					amount: 10,
					customerId: "cus_1",
					featureId: "agent-credits",
					redemptionId: "redemption-2",
					secretKey: "secret",
				});
			} catch (caught) {
				error = caught;
			}

			expect(error).toBeInstanceOf(Error);
			expect(isDefinitiveAutumnBalanceFailure(error)).toBe(definitive);
		}
	);

	it("fails definitively without calling Autumn when no secret key is configured", async () => {
		const fetchMock = mock(async () => new Response("{}", { status: 200 }));
		globalThis.fetch = fetchMock as typeof fetch;
		const originalSecret = process.env.AUTUMN_SECRET_KEY;
		delete process.env.AUTUMN_SECRET_KEY;

		let error: unknown;
		try {
			await updateAutumnBalance({
				amount: 10,
				customerId: "cus_1",
				featureId: "agent-credits",
				redemptionId: "redemption-4",
				secretKey: null,
			});
		} catch (caught) {
			error = caught;
		} finally {
			if (originalSecret !== undefined) {
				process.env.AUTUMN_SECRET_KEY = originalSecret;
			}
		}

		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("marks network failures as ambiguous so callers do not roll back spent credits", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("socket closed after write");
		}) as typeof fetch;

		let error: unknown;
		try {
			await updateAutumnBalance({
				amount: 10,
				customerId: "cus_1",
				featureId: "agent-credits",
				redemptionId: "redemption-3",
				secretKey: "secret",
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(false);
	});
});

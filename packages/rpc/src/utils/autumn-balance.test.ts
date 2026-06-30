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

	it("marks 4xx Autumn responses as definitive failures that are safe to roll back", async () => {
		globalThis.fetch = mock(
			async () => new Response("bad request", { status: 400 })
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

		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(true);
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

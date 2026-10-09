import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	isDefinitiveAutumnBalanceFailure,
	updateAutumnBalance,
} from "./autumn-balance";

const originalFetch = globalThis.fetch;
const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		AUTUMN_SECRET_KEY: "synthetic-balance-key",
		NODE_ENV: "test",
		SELFHOST: "false",
	};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env = originalEnv;
});

function update(redemptionId: string) {
	return updateAutumnBalance({
		amount: 2500,
		customerId: "cus_1",
		featureId: "events",
		redemptionId,
	});
}

describe("updateAutumnBalance", () => {
	it("posts the balance update with a redemption-scoped idempotency key", async () => {
		const fetchMock = mock(
			async (_input: string | URL | Request, _init?: RequestInit) =>
				Response.json({ success: true })
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await update("redemption-1");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [input, init] = fetchMock.mock.calls[0];
		const request = new Request(input, init);
		expect(request.url).toBe("https://api.useautumn.com/v1/balances.update");
		expect(request.headers.get("Idempotency-Key")).toBe(
			"feedback-redemption:redemption-1"
		);
		expect(await request.json()).toEqual({
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
	])("treats an HTTP %i Autumn response as definitive=%p for rollback", async (status, definitive) => {
		globalThis.fetch = mock(async () =>
			Response.json({ message: "autumn error" }, { status })
		) as unknown as typeof fetch;

		const error = await update("redemption-2").catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(definitive);
	});

	it("fails definitively without calling Autumn when billing is not live", async () => {
		const fetchMock = mock(async () => Response.json({ success: true }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		process.env.SELFHOST = "true";

		const error = await update("redemption-4").catch((caught) => caught);

		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("marks network failures as ambiguous so callers do not roll back spent credits", async () => {
		globalThis.fetch = mock(async () => {
			throw new TypeError("socket closed after write");
		}) as unknown as typeof fetch;

		const error = await update("redemption-3").catch((caught) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(isDefinitiveAutumnBalanceFailure(error)).toBe(false);
	});
});

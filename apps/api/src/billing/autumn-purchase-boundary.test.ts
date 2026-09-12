import { beforeEach, describe, expect, it, vi } from "vitest";

const { forward } = vi.hoisted(() => ({
	forward: vi.fn(async (request: Request) =>
		Response.json(await request.json())
	),
}));
vi.mock("autumn-js/fetch", () => ({ autumnHandler: () => forward }));
vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession: vi.fn(async () => null) } },
}));
vi.mock("@databuddy/redis", () => ({ getRedisCache: vi.fn() }));
vi.mock("@databuddy/rpc", () => ({
	getBillingCustomerId: vi.fn(),
	getMemberRole: vi.fn(),
}));

import { handleAutumnRequest } from "./autumn";

function request(body: unknown, contentType: string | null) {
	const value = new Request("https://synthetic.invalid/autumn/attach", {
		method: "POST",
		body: JSON.stringify(body),
	});
	if (contentType) {
		value.headers.set("content-type", contentType);
	} else {
		value.headers.delete("content-type");
	}
	return value;
}

beforeEach(() => {
	forward.mockClear();
});

describe.each([
	"application/json",
	"text/plain",
	null,
])("Autumn investigation boundary with %s content type", (contentType) => {
	it("strips new-feature grants nested in another plan before native forwarding", async () => {
		const response = await handleAutumnRequest(
			request(
				{
					planId: "pro",
					customize: {
						addItems: [{ featureId: "investigation_runs", included: 1000 }],
					},
				},
				contentType
			)
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ planId: "pro" });
		expect(forward).toHaveBeenCalledTimes(1);
	});

	it("rejects a fixed-unit quantity override on another plan before forwarding", async () => {
		const response = await handleAutumnRequest(
			request(
				{
					planId: "pro",
					featureQuantities: [
						{ featureId: "investigation_runs", quantity: 1000 },
					],
				},
				contentType
			)
		);
		expect(response.status).toBe(422);
		expect(forward).not.toHaveBeenCalled();
	});

	it("forwards the exact whole-unit purchase after removing client checkout URLs", async () => {
		const purchase = {
			planId: "investigations_topup",
			featureQuantities: [{ featureId: "investigation_runs", quantity: 10 }],
		};
		const response = await handleAutumnRequest(
			request(
				{
					...purchase,
					successUrl: "https://synthetic.invalid/billing",
				},
				contentType
			)
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(purchase);
		expect(forward).toHaveBeenCalledTimes(1);
	});
});

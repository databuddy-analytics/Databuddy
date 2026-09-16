import type { JSONValue } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { forward } = vi.hoisted(() => ({
	forward: vi.fn(async (request: Request) =>
		Response.json(await request.json())
	),
}));
vi.mock("autumn-js/fetch", () => ({ autumnHandler: () => forward }));
const { getSession, getBillingCustomerId, getMemberRole } = vi.hoisted(
	() => ({
		getSession: vi.fn(async () => null),
		getBillingCustomerId: vi.fn(),
		getMemberRole: vi.fn(),
	})
);
vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession } },
}));
vi.mock("@databuddy/redis", () => ({
	getRedisCache: () => ({ del: vi.fn(async () => 0) }),
}));
vi.mock("@databuddy/rpc", () => ({
	getBillingCustomerId,
	getMemberRole,
}));

import { handleAutumnRequest } from "./autumn";

function request(body: JSONValue, contentType: string | null) {
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
	getSession.mockResolvedValue(null);
	getMemberRole.mockReset();
	getBillingCustomerId.mockReset();
});

describe("Autumn attach Dub attribution", () => {
	it("stamps the billing owner as the Dub customer on authenticated attach", async () => {
		getSession.mockResolvedValue({
			user: { id: "synthetic-user", name: "Synthetic user", email: null },
			session: { activeOrganizationId: "synthetic-org" },
		} as never);
		getMemberRole.mockResolvedValue("owner");
		getBillingCustomerId.mockResolvedValue("synthetic-owner");

		const response = await handleAutumnRequest(
			request(
				{
					planId: "pro",
					metadata: {
						databuddy_client_id: "client",
						dubCustomerExternalId: "spoofed",
					},
				},
				"application/json"
			)
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			planId: "pro",
			metadata: {
				databuddy_client_id: "client",
				dubCustomerExternalId: "synthetic-owner",
			},
		});
	});

	it("leaves attach metadata untouched for anonymous requests", async () => {
		const response = await handleAutumnRequest(
			request({ planId: "pro", metadata: { a: "b" } }, "application/json")
		);
		expect(await response.json()).toEqual({
			planId: "pro",
			metadata: { a: "b" },
		});
	});
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

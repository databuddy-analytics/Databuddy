import { describe, expect, it, mock } from "bun:test";

const mockCreateServiceAuth = mock((organizationId: string, scopes: string[]) => ({
	apiKey: { organizationId, scopes },
	session: null,
}));
const actualRpc = await import("@databuddy/rpc");

mock.module("@databuddy/rpc", () => ({
	...actualRpc,
	createServiceAuth: mockCreateServiceAuth,
}));

const { createInsightsServiceAuth, INSIGHTS_SERVICE_AUTH_SCOPES } = await import(
	"./service-auth"
);

describe("createInsightsServiceAuth", () => {
	it("delegates to service auth with read-only scopes", () => {
		const auth = createInsightsServiceAuth("org_1");

		expect(auth.apiKey?.organizationId).toBe("org_1");
		expect(auth.apiKey?.scopes).toEqual(["read:data"]);
		expect(INSIGHTS_SERVICE_AUTH_SCOPES).toEqual(["read:data"]);
		expect(mockCreateServiceAuth).toHaveBeenCalledTimes(1);
		expect(mockCreateServiceAuth).toHaveBeenCalledWith("org_1", ["read:data"]);
	});
});

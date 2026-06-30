import { describe, expect, it, mock } from "bun:test";

const mockCreateServiceAuth = mock((organizationId: string, scopes: string[]) => ({
	apiKey: { organizationId, scopes },
	session: null,
}));

mock.module("@databuddy/rpc", () => ({
	createServiceAuth: mockCreateServiceAuth,
}));

const { createInsightsServiceAuth, INSIGHTS_SERVICE_AUTH_SCOPES } = await import(
	"./service-auth"
);

describe("createInsightsServiceAuth", () => {
	it("grants read data and website management scopes to insights agents", () => {
		const auth = createInsightsServiceAuth("org_1");

		expect(auth.apiKey?.organizationId).toBe("org_1");
		expect(auth.apiKey?.scopes).toEqual(["read:data", "manage:websites"]);
		expect(INSIGHTS_SERVICE_AUTH_SCOPES).toEqual([
			"read:data",
			"manage:websites",
		]);
	});
});

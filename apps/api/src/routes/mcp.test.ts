import { beforeEach, describe, expect, it, vi } from "vitest";
import { Elysia } from "elysia";

const mocks = vi.hoisted(() => ({
	createMcpUnauthorizedResponse: vi.fn(),
	getAccessibleWebsiteIds: vi.fn(),
	getApiKeyFromHeader: vi.fn(),
	getResolvedAuth: vi.fn(),
	getSession: vi.fn(),
	handleDatabuddyMcpRequest: vi.fn(),
	hasKeyScope: vi.fn(),
	hasWebsiteScope: vi.fn(),
	isApiKeyPresent: vi.fn(),
}));

vi.mock("@databuddy/api-keys/resolve", () => ({
	getAccessibleWebsiteIds: mocks.getAccessibleWebsiteIds,
	getApiKeyFromHeader: mocks.getApiKeyFromHeader,
	hasKeyScope: mocks.hasKeyScope,
	hasWebsiteScope: mocks.hasWebsiteScope,
	isApiKeyPresent: mocks.isApiKeyPresent,
}));

vi.mock("@databuddy/ai/mcp/http", () => ({
	createMcpUnauthorizedResponse: mocks.createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest: mocks.handleDatabuddyMcpRequest,
}));

vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@databuddy/env/app", () => ({
	config: { urls: { api: "https://api.example.com" } },
}));

vi.mock("../lib/auth-wide-event", () => ({
	getResolvedAuth: mocks.getResolvedAuth,
}));

import { mcp } from "./mcp";

const apiKey = {
	id: "key-1",
	organizationId: "org-1",
	scopes: ["read:data"],
};

beforeEach(() => {
	mocks.createMcpUnauthorizedResponse.mockReset();
	mocks.getAccessibleWebsiteIds.mockReset();
	mocks.getApiKeyFromHeader.mockReset();
	mocks.getResolvedAuth.mockReset();
	mocks.getSession.mockReset();
	mocks.handleDatabuddyMcpRequest.mockReset();
	mocks.hasKeyScope.mockReset();
	mocks.hasWebsiteScope.mockReset();
	mocks.isApiKeyPresent.mockReset();

	mocks.getAccessibleWebsiteIds.mockReturnValue([]);
	mocks.handleDatabuddyMcpRequest.mockResolvedValue(new Response("ok"));
	mocks.hasKeyScope.mockReturnValue(true);
	mocks.isApiKeyPresent.mockReturnValue(true);
});

describe("MCP route auth", () => {
	it.each(["/v1/mcp", "/v1/mcp/"])(
		"reuses root-resolved API-key auth for %s",
		async (path) => {
			const order: string[] = [];
			const resolvedAuth = {
				apiKeyResult: { key: apiKey },
				session: null,
			};
			mocks.getResolvedAuth.mockImplementation((context) => {
				order.push("mcp");
				return context.resolvedAuth;
			});
			const app = new Elysia({ precompile: true })
				.onBeforeHandle(() => {
					order.push("in_flight");
				})
				.resolve({ as: "global" }, () => {
					order.push("auth");
					return { resolvedAuth };
				})
				.use(mcp);

			const response = await app.handle(
				new Request(`https://api.example.com${path}`, { method: "POST" })
			);

			expect(response.status).toBe(200);
			expect(order).toEqual(["in_flight", "auth", "mcp"]);
			expect(mocks.getApiKeyFromHeader).not.toHaveBeenCalled();
			expect(mocks.getSession).not.toHaveBeenCalled();
			expect(mocks.handleDatabuddyMcpRequest).toHaveBeenCalledWith(
				expect.objectContaining({
					apiKey,
					organizationId: "org-1",
					userId: null,
				})
			);
		}
	);
});

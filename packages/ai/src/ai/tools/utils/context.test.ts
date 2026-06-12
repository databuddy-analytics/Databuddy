import { describe, expect, it } from "bun:test";
import type { AppContext } from "../../config/context";
import { resolveToolWebsite } from "./context";

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
	return {
		chatId: "chat_1",
		currentDateTime: "2026-05-30T00:00:00.000Z",
		timezone: "UTC",
		userId: "user_1",
		...overrides,
	};
}

describe("resolveToolWebsite", () => {
	it("rejects a websiteId that is not accessible and not the context website", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
			],
			websiteId: "web_ctx",
		});

		expect(() => resolveToolWebsite(ctx, "web_other")).toThrow(
			/not in this workspace/
		);
	});

	it("rejects any websiteId when the workspace has no accessible websites", () => {
		const ctx = makeCtx({ accessibleWebsites: [] });

		expect(() => resolveToolWebsite(ctx, "web_other")).toThrow(
			/not in this workspace/
		);
	});

	it("accepts a websiteId that is in the accessible set", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(resolveToolWebsite(ctx, "web_a")).toEqual({
			websiteId: "web_a",
			domain: "a.com",
		});
	});

	it("accepts a websiteId matching the single-site context website", () => {
		const ctx = makeCtx({ websiteId: "web_ctx", websiteDomain: "ctx.com" });

		expect(resolveToolWebsite(ctx, "web_ctx")).toEqual({
			websiteId: "web_ctx",
			domain: "ctx.com",
		});
	});

	it("falls back to the default website when no websiteId is given", () => {
		const ctx = makeCtx({
			defaultWebsiteId: "web_default",
			accessibleWebsites: [
				{
					id: "web_default",
					domain: "default.com",
					name: null,
					isPublic: null,
					createdAt: null,
				},
			],
		});

		expect(resolveToolWebsite(ctx)).toEqual({
			websiteId: "web_default",
			domain: "default.com",
		});
	});

	it("throws when multiple websites are accessible and none is specified", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
				{ id: "web_b", domain: "b.com", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(() => resolveToolWebsite(ctx)).toThrow(/multiple websites/);
	});

	it("resolves a domain name matching ctx.websiteDomain to the context websiteId", () => {
		// Insights agent passes domain names (e.g. "databuddy.cc") because LLM confuses
		// domain with websiteId after seeing domain-keyed SQL queries.
		const ctx = makeCtx({
			websiteId: "internal-id-xyz",
			websiteDomain: "databuddy.cc",
		});

		expect(resolveToolWebsite(ctx, "databuddy.cc")).toEqual({
			websiteId: "internal-id-xyz",
			domain: "databuddy.cc",
		});
	});

	it("resolves a domain name matching an accessible website's domain", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
				{ id: "web_b", domain: "b.com", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(resolveToolWebsite(ctx, "b.com")).toEqual({
			websiteId: "web_b",
			domain: "b.com",
		});
	});

	it("still rejects a domain that is not ctx.websiteDomain and not in accessible list", () => {
		const ctx = makeCtx({
			websiteId: "internal-id-xyz",
			websiteDomain: "databuddy.cc",
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(() => resolveToolWebsite(ctx, "unknown.com")).toThrow(
			/not in this workspace/
		);
	});
});

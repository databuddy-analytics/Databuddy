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

	it("resolves a domain name to its UUID from accessibleWebsites", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "finvzo.com", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(resolveToolWebsite(ctx, "finvzo.com")).toEqual({
			websiteId: "web_a",
			domain: "finvzo.com",
		});
	});

	it("resolves accessible website domains case-insensitively", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "Finvzo.COM", name: null, isPublic: null, createdAt: null },
			],
		});

		expect(resolveToolWebsite(ctx, " finvzo.com ")).toEqual({
			websiteId: "web_a",
			domain: "Finvzo.COM",
		});
	});

	it("resolves ctx.websiteDomain to ctx.websiteId for single-site contexts", () => {
		const ctx = makeCtx({
			websiteId: "web_ctx",
			websiteDomain: "ctx-domain.com",
			accessibleWebsites: [],
		});

		expect(resolveToolWebsite(ctx, "ctx-domain.com")).toEqual({
			websiteId: "web_ctx",
			domain: "ctx-domain.com",
		});
	});

	it("resolves ctx.websiteDomain case-insensitively for single-site contexts", () => {
		const ctx = makeCtx({
			websiteId: "web_ctx",
			websiteDomain: "Ctx-Domain.COM",
			accessibleWebsites: [],
		});

		expect(resolveToolWebsite(ctx, "ctx-domain.com")).toEqual({
			websiteId: "web_ctx",
			domain: "Ctx-Domain.COM",
		});
	});

	it("still rejects a domain that does not match any accessible website", () => {
		const ctx = makeCtx({
			accessibleWebsites: [
				{ id: "web_a", domain: "a.com", name: null, isPublic: null, createdAt: null },
			],
			websiteId: "web_ctx",
			websiteDomain: "ctx.com",
		});

		expect(() => resolveToolWebsite(ctx, "unknown.com")).toThrow(
			/not in this workspace/
		);
	});
});

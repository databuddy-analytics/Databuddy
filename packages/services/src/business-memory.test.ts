import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import Supermemory from "supermemory";
import {
	businessContainerTag,
	canonicalBusinessScope,
	retireBusinessMemory,
} from "./business-memory";

const scope = {
	organizationId: "org-example",
	websiteId: "site-example",
	domain: "reports.example.com",
};
const startedAt = "2026-09-07T10:00:00.000Z";

describe("business memory identity and native retirement", () => {
	it("keeps legacy three-part identity and separates each production epoch", () => {
		const legacy = createHash("sha256")
			.update(
				JSON.stringify([scope.organizationId, scope.websiteId, scope.domain])
			)
			.digest("hex")
			.slice(0, 40);
		expect(businessContainerTag(scope)).toBe(`business_${legacy}`);
		expect(businessContainerTag({ ...scope, startedAt })).not.toBe(
			businessContainerTag(scope)
		);
		expect(
			businessContainerTag({ ...scope, startedAt: "2026-09-07T10:00:00.001Z" })
		).not.toBe(businessContainerTag({ ...scope, startedAt }));
		expect(
			businessContainerTag({
				...scope,
				startedAt,
				domain: "WWW.REPORTS.EXAMPLE.COM.",
			})
		).toBe(businessContainerTag({ ...scope, startedAt }));
		expect(
			canonicalBusinessScope({
				...scope,
				startedAt: "2026-09-07T12:00:00+02:00",
			}).startedAt
		).toBe(startedAt);
	});
	it("rejects ambiguous domains and invalid epochs before persistence", () => {
		for (const domain of [
			".",
			"reports.example.com@other.test",
			"reports.example.com/path",
			"reports.example.com:8443",
		]) {
			expect(() => businessContainerTag({ ...scope, domain })).toThrow();
		}
		expect(() =>
			businessContainerTag({ ...scope, startedAt: "yesterday" })
		).toThrow();
	});
	it("retires only the exact business container through the native SDK", async () => {
		const requests: unknown[] = [];
		const client = new Supermemory({
			apiKey: "synthetic-only",
			fetch: async (input, init) => {
				const request = new Request(input, init);
				expect(new URL(request.url).pathname).toBe("/v3/documents/bulk");
				expect(request.method).toBe("DELETE");
				requests.push(await request.json());
				return Response.json({
					success: true,
					deletedCount: 1,
					skippedProcessingCount: 0,
				});
			},
		});
		expect(
			await retireBusinessMemory({ ...scope, startedAt }, { client })
		).toEqual({ status: "retired" });
		expect(requests).toEqual([
			{ containerTags: [businessContainerTag({ ...scope, startedAt })] },
		]);
	});
	it("rejects partial, malformed and failed acknowledgments instead of claiming retirement", async () => {
		for (const response of [
			{ success: true, deletedCount: 1, skippedProcessingCount: 1 },
			{
				success: true,
				deletedCount: 1,
				errors: [{ id: "pending", error: "still processing" }],
			},
			{ success: false, deletedCount: 0 },
			{ success: true },
		]) {
			let attempts = 0;
			const client = new Supermemory({
				apiKey: "synthetic-only",
				fetch: async () => {
					attempts++;
					return Response.json(response);
				},
			});
			await expect(
				retireBusinessMemory({ ...scope, startedAt }, { client })
			).rejects.toThrow("retry");
			expect(attempts).toBe(1);
		}
	});
	it("does not retry transport failure or an already cancelled operation", async () => {
		let attempts = 0;
		const client = new Supermemory({
			apiKey: "synthetic-only",
			fetch: async () => {
				attempts++;
				return Response.json({ error: "unavailable" }, { status: 503 });
			},
		});
		await expect(retireBusinessMemory(scope, { client })).rejects.toThrow();
		expect(attempts).toBe(1);
		await expect(
			retireBusinessMemory(scope, { client, abortSignal: AbortSignal.abort() })
		).rejects.toThrow();
		expect(attempts).toBe(1);
	});
});

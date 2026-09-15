import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
	createMarbleRequest,
	createPostListEndpoint,
	isPublished,
	getSinglePost,
	getPostModifiedAt,
	normalizeMarbleApiUrl,
} from "./blog-query";

describe("Marble blog query helpers", () => {
	test("normalizes Marble API URLs to the v1 base", () => {
		expect(normalizeMarbleApiUrl(undefined)).toBe(
			"https://api.marblecms.com/v1"
		);
		expect(normalizeMarbleApiUrl("https://api.marblecms.com")).toBe(
			"https://api.marblecms.com/v1"
		);
		expect(normalizeMarbleApiUrl("https://api.marblecms.com/v1/")).toBe(
			"https://api.marblecms.com/v1"
		);
		expect(normalizeMarbleApiUrl("   ")).toBe(
			"https://api.marblecms.com/v1"
		);
	});

	test("builds API-key requests without the legacy workspace path", () => {
		const request = createMarbleRequest(createPostListEndpoint(), {
			MARBLE_API_KEY: "  test-token  ",
			MARBLE_API_URL: "https://api.marblecms.com",
			MARBLE_WORKSPACE_KEY: "legacy-workspace",
		});

		expect("error" in request).toBe(false);
		if ("error" in request) {
			return;
		}

		expect(request.url).toBe(
			"https://api.marblecms.com/v1/posts?limit=100&order=desc&status=published"
		);
		expect(request.headers).toEqual({
			Authorization: "test-token",
		});
	});

	test("falls back to workspace-key requests for legacy Marble workspaces", () => {
		const request = createMarbleRequest("/posts/example-post", {
			MARBLE_API_URL: "https://api.marblecms.com/v1",
			MARBLE_WORKSPACE_KEY: "cm-workspace",
		});

		expect("error" in request).toBe(false);
		if ("error" in request) {
			return;
		}

		expect(request.url).toBe(
			"https://api.marblecms.com/v1/cm-workspace/posts/example-post"
		);
		expect(request.headers).toEqual({});
	});

	test("returns a fetch error when Marble credentials are missing", () => {
		const request = createMarbleRequest("posts", {
			MARBLE_API_KEY: " ",
			MARBLE_WORKSPACE_KEY: " ",
		});

		expect(request).toEqual({
			error: true,
			status: 500,
			statusText: "Environment variables not configured",
		});
	});

	test("filters drafts, future posts, and invalid publish dates", () => {
		expect(
			isPublished({
				publishedAt: "2024-01-01T00:00:00.000Z",
				status: "published",
			})
		).toBe(true);
		expect(
			isPublished({
				publishedAt: "2024-01-01T00:00:00.000Z",
				status: "draft",
			})
		).toBe(false);
		expect(
			isPublished({
				publishedAt: new Date(Date.now() + 60_000).toISOString(),
				status: "published",
			})
		).toBe(false);
		expect(
			isPublished({
				publishedAt: "not-a-date",
				status: "published",
			})
		).toBe(false);
	});
});


describe("published blog retrieval", () => {
	const originalApiKey = process.env.MARBLE_API_KEY;
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalApiKey === undefined) {
			delete process.env.MARBLE_API_KEY;
		} else {
			process.env.MARBLE_API_KEY = originalApiKey;
		}
	});

	test("missing and unpublished posts use the same 404 boundary; outages stay errors", async () => {
		process.env.MARBLE_API_KEY = "test-token";
		const fetch = spyOn(globalThis, "fetch");
		fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
		await expect(getSinglePost("missing")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
		for (const post of [
			{ status: "draft", publishedAt: "2024-01-01" },
			{ status: "published", publishedAt: "2999-01-01" },
		]) {
			fetch.mockResolvedValueOnce(Response.json({ post }));
			await expect(getSinglePost("unpublished")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
		}
		fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
		await expect(getSinglePost("unavailable")).rejects.toThrow("Failed to load blog post: 503");
		const post = { title: "Published", publishedAt: "2024-01-01" };
		fetch.mockResolvedValueOnce(Response.json({ post }));
		expect(await getSinglePost("published")).toEqual(post);
	});

	test("modification dates use actual updates and reject invalid or future dates", () => {
		const publishedAt = "2024-01-01T00:00:00.000Z";
		expect(getPostModifiedAt({ publishedAt, updatedAt: "2024-02-01" })).toBe("2024-02-01T00:00:00.000Z");
		for (const updatedAt of [undefined, "invalid", "2023-01-01", "2999-01-01"]) {
			expect(getPostModifiedAt({ publishedAt, updatedAt })).toBe(publishedAt);
		}
	});
});

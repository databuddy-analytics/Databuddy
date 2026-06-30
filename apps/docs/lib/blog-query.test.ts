import { describe, expect, test } from "bun:test";
import {
	createMarbleRequest,
	createPostListEndpoint,
	isPublished,
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

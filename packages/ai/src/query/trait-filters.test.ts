import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	invalidFilterFieldError,
	resolveRequestTraitFilters,
} from "./trait-filters";
import type { QueryRequest } from "./types";

const mockResolveTraitSegment = vi.fn();

vi.mock("@databuddy/services/identity", () => {
	class TraitFilterError extends Error {}

	return {
		TraitFilterError,
		isTraitFilterField: (field: string) =>
			field.startsWith("trait:") && field.length > "trait:".length,
		resolveTraitSegment: mockResolveTraitSegment,
	};
});

function makeRequest(overrides: Partial<QueryRequest> = {}): QueryRequest {
	return {
		projectId: "test-site",
		type: "top_pages",
		from: "2026-04-01",
		to: "2026-04-11",
		...overrides,
	};
}

describe("resolveRequestTraitFilters", () => {
	beforeEach(() => {
		mockResolveTraitSegment.mockReset();
		mockResolveTraitSegment.mockResolvedValue(["profile-a", "profile-b"]);
	});

	it("returns the original request when no trait filters are present", async () => {
		const request = makeRequest({
			filters: [{ field: "path", op: "eq", value: "/" }],
		});

		await expect(resolveRequestTraitFilters(request)).resolves.toBe(request);
		expect(mockResolveTraitSegment).not.toHaveBeenCalled();
	});

	it("resolves trait filters to a profile_id segment filter", async () => {
		const request = makeRequest({
			filters: [
				{ field: "path", op: "eq", value: "/" },
				{ field: "trait:plan", op: "eq", value: "pro" },
				{ field: "trait:role", op: "in", value: ["admin", "owner"] },
			],
		});

		const resolved = await resolveRequestTraitFilters(request);

		expect(mockResolveTraitSegment).toHaveBeenCalledWith("test-site", [
			{ field: "trait:plan", op: "eq", value: "pro" },
			{ field: "trait:role", op: "in", value: ["admin", "owner"] },
		]);
		expect(resolved.filters).toEqual([
			{ field: "path", op: "eq", value: "/" },
			{ field: "profile_id", op: "in", value: ["profile-a", "profile-b"] },
		]);
	});

	it("rejects trait filters for organization-scoped queries", async () => {
		await expect(
			resolveRequestTraitFilters(
				makeRequest({
					organizationWebsiteIds: ["site-a", "site-b"],
					projectId: "org-id",
					filters: [{ field: "trait:plan", op: "eq", value: "pro" }],
				})
			)
		).rejects.toThrow("website-scoped queries");
		expect(mockResolveTraitSegment).not.toHaveBeenCalled();
	});

	it("rejects query types that cannot filter by profile_id", async () => {
		await expect(
			resolveRequestTraitFilters(
				makeRequest({
					type: "session_events",
					filters: [{ field: "trait:plan", op: "eq", value: "pro" }],
				})
			)
		).rejects.toThrow("Trait filters are not supported for session_events");
		expect(mockResolveTraitSegment).not.toHaveBeenCalled();
	});
});

describe("invalidFilterFieldError", () => {
	it("rejects fields outside the query type's allowlist with the allowed list", () => {
		const error = invalidFilterFieldError("session_metrics", [
			{ field: "definitely_not_a_column", op: "eq", value: "x" },
		]);
		expect(error).toContain("definitely_not_a_column");
		expect(error).toContain("session_metrics");
		expect(error).toContain("profile_id");
	});

	it("accepts allowed, global, and trait filter fields", () => {
		expect(
			invalidFilterFieldError("session_metrics", [
				{ field: "country", op: "eq", value: "US" },
				{ field: "profile_id", op: "eq", value: "user-1" },
				{ field: "trait:plan", op: "eq", value: "free" },
			])
		).toBeNull();
	});

	it("ignores target and having scoped filters", () => {
		expect(
			invalidFilterFieldError("session_metrics", [
				{ field: "session_count", op: "eq", value: 3, having: true },
				{ field: "custom_field", op: "eq", value: "x", target: "my_cte" },
			])
		).toBeNull();
	});

	it("returns null for unknown query types and empty filters", () => {
		expect(
			invalidFilterFieldError("nope", [
				{ field: "custom", op: "eq", value: "x" },
			])
		).toBeNull();
		expect(invalidFilterFieldError("session_metrics", [])).toBeNull();
	});
});

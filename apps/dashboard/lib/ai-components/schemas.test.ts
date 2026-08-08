import { describe, expect, test } from "bun:test";
import { linksListSchema } from "./schemas";

const baseLink = {
	id: "link-1",
	name: "Example link",
	targetUrl: "https://example.com",
};

describe("linksListSchema", () => {
	test("accepts persisted link slugs and rejects unsafe display slugs", () => {
		expect(
			linksListSchema.safeParse({
				type: "links-list",
				links: [{ ...baseLink, slug: "launch_2026" }],
			}).success
		).toBe(true);
		expect(
			linksListSchema.safeParse({
				type: "links-list",
				links: [{ ...baseLink, slug: "/evil.example" }],
			}).success
		).toBe(false);
	});
});

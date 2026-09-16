import { expect, test } from "bun:test";
import {
	businessContextSourceBelongsToSite,
	businessContextSourceUrlsSchema,
} from "./organization-business-context";

test("business source pages are bounded public URLs scoped to the selected site", () => {
	const urls = ["https://example.com/pricing", "https://docs.example.com/start"];
	expect(businessContextSourceUrlsSchema.parse(urls)).toEqual(urls);
	for (const url of urls) expect(businessContextSourceBelongsToSite(url, "www.example.com")).toBe(true);
	for (const url of ["https://example.com.evil.example/", "https://other.example/"]) {
		expect(businessContextSourceBelongsToSite(url, "example.com")).toBe(false);
	}
	for (const url of ["not a URL", "file:///secret", "http://127.0.0.1/", "http://[::1]/", "http://localhost/", "https://app.internal/", "https://user:secret@example.com/", "https://example.com:444/", "https://example.com/?token=secret", "https://example.com/#secret"]) {
		expect(businessContextSourceUrlsSchema.safeParse([url]).success).toBe(false);
	}
	expect(businessContextSourceUrlsSchema.safeParse(Array(7).fill(urls[0])).success).toBe(false);
});

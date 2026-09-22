import { describe, expect, test } from "bun:test";
import {
	createDeepLinkFallbackResponse,
	renderDeepLinkFallbackPage,
} from "./deep-link-fallback";

describe("deep-link fallback page", () => {
	test("serializes URLs safely in HTML and JavaScript", () => {
		const page = renderDeepLinkFallbackPage(
			"app://open?value=</script><script>alert(1)</script>",
			"https://example.com/?value=<unsafe>"
		);

		expect(page).not.toContain("</script><script>alert(1)</script>");
		expect(page).toContain("\\u003c/script\\u003e");
		expect(page).toContain("&lt;unsafe&gt;");
	});

	test("returns a no-store HTML response", async () => {
		const response = createDeepLinkFallbackResponse(
			"spotify://track/example",
			"https://open.spotify.com/track/example"
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("content-type")).toContain("text/html");
	});
});

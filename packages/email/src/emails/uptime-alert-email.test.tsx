/** biome-ignore-all lint/performance/useTopLevelRegex: it's a test file */
import { describe, expect, test } from "bun:test";
import { render as renderEmail } from "react-email";
import { UptimeAlertEmail } from "./uptime-alert-email";

type Props = Parameters<typeof UptimeAlertEmail>[0];

function render(props: Props): Promise<string> {
	return renderEmail(UptimeAlertEmail(props));
}

const SAFE_HREF_FALLBACK = "https://app.databuddy.cc/";

describe("UptimeAlertEmail — URL text rendering", () => {
	test("slashes render literally, not as &#x2F; entities", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "server.example.com",
			url: "https://server.example.com",
		});
		expect(html).toContain("https://server.example.com");
		expect(html).not.toContain("&#x2F;");
		expect(html).not.toContain("&amp;#x2F;");
	});

	test("query-string ampersands are escaped exactly once", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com/path?a=1&b=2&c=3",
		});
		expect(html).toContain("a=1&amp;b=2&amp;c=3");
		expect(html).not.toContain("&amp;amp;");
	});

	test("percent-encoded URLs survive unchanged", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com/path%20with%20spaces?q=hello%20world",
		});
		expect(html).toContain(
			"https://example.com/path%20with%20spaces?q=hello%20world"
		);
	});

	test("unicode hosts render as typed in text (IDN domains)", async () => {
		const html = await render({ kind: "down", url: "https://münchen.de/über" });
		expect(html).toContain("münchen.de");
		expect(html).toContain("über");
	});

	test("URLs with port, path, query, fragment all render", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com:8443/a/b?x=1#section",
		});
		expect(html).toContain("https://example.com:8443/a/b?x=1#section");
	});

	test("very long URL (2KB) does not throw or truncate visibly", async () => {
		const longPath = "a".repeat(2048);
		const url = `https://example.com/${longPath}`;
		const html = await render({ kind: "down", url });
		expect(html).toContain(longPath);
	});
});

describe("UptimeAlertEmail — href protocol allowlist (XSS)", () => {
	test("javascript: URL never appears in an href attribute", async () => {
		const html = await render({ kind: "down", url: "javascript:alert(1)" });
		expect(html).not.toMatch(/href="javascript:/i);
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});

	test("data: URL never appears in an href attribute", async () => {
		const html = await render({
			kind: "down",
			url: "data:text/html,<script>alert(1)</script>",
		});
		expect(html).not.toMatch(/href="data:/i);
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});

	test("vbscript: URL is rejected", async () => {
		const html = await render({ kind: "down", url: "vbscript:msgbox(1)" });
		expect(html).not.toMatch(/href="vbscript:/i);
	});

	test("file: URL is rejected", async () => {
		const html = await render({ kind: "down", url: "file:///etc/passwd" });
		expect(html).not.toMatch(/href="file:/i);
	});

	test("ftp: URL is rejected (non http/https)", async () => {
		const html = await render({ kind: "down", url: "ftp://example.com/a" });
		expect(html).not.toMatch(/href="ftp:/i);
	});

	test("protocol-relative //evil.com falls back to default href", async () => {
		const html = await render({ kind: "down", url: "//evil.com/x" });
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});

	test("mixed-case JaVaScRiPt: is rejected (protocol compared case-insensitively by URL parser)", async () => {
		const html = await render({ kind: "down", url: "JaVaScRiPt:alert(1)" });
		expect(html).not.toMatch(/href="j/i);
	});

	test("URL with embedded whitespace/newline is rejected", async () => {
		const html = await render({ kind: "down", url: "java\nscript:alert(1)" });
		expect(html).not.toMatch(/href="java/i);
	});

	test("empty url falls back to default href", async () => {
		const html = await render({ kind: "down", url: "" });
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});

	test("malformed URL (no scheme, unparseable) falls back to default href", async () => {
		const html = await render({ kind: "down", url: "not a url at all" });
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});
});

describe("UptimeAlertEmail — HTML injection in string fields", () => {
	test("siteLabel <script> is escaped, not executable", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "<script>alert(1)</script>",
			url: "https://example.com",
		});
		expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	});

	test("siteLabel <img onerror> payload is escaped", async () => {
		const html = await render({
			kind: "down",
			siteLabel: '<img src=x onerror="alert(1)">',
			url: "https://example.com",
		});
		expect(html).not.toMatch(/<img\s+src=x\s+onerror/i);
		expect(html).toContain("&lt;img");
	});

	test("error field with HTML tags is escaped", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			error: "<svg onload=alert(1)></svg>",
		});
		expect(html).not.toMatch(/<svg\s+onload/i);
		expect(html).toContain("&lt;svg");
	});

	test("probeRegion with injection payload is escaped", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			probeRegion: '"><script>alert(1)</script>',
		});
		expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
		expect(html).toContain("&quot;&gt;&lt;script&gt;");
	});

	test("attribute-breakout quotes in URL payload cannot escape the anchor tag", async () => {
		const html = await render({
			kind: "down",
			url: 'https://example.com" onmouseover="alert(1)',
		});
		// Raw quote after the anchor tag opens would be a breakout; ensure only escaped.
		expect(html).not.toMatch(/<a[^>]*onmouseover="alert/i);
		expect(html).toContain("onmouseover=&quot;alert(1)");
		// And the href itself must be the safe fallback (URL parser rejects it).
		expect(html).toContain(`href="${SAFE_HREF_FALLBACK}"`);
	});

	test("existing HTML entities in input are escaped only once (no double-encode)", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "Tom &amp; Jerry",
			url: "https://example.com",
		});
		expect(html).toContain("Tom &amp;amp; Jerry");
		expect(html).not.toContain("Tom &amp;amp;amp;");
	});

	test("null bytes / control chars in siteLabel do not break output", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "evil\u0000\u0001site",
			url: "https://example.com",
		});
		expect(html.length).toBeGreaterThan(0);
	});
});

describe("UptimeAlertEmail — field fallbacks and optional props", () => {
	test("all optional props undefined renders without throwing", async () => {
		const html = await render({});
		expect(html.length).toBeGreaterThan(0);
		expect(html).toContain("example.com");
	});

	test("empty siteLabel falls back to 'your site'", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "",
			url: "https://x.com",
		});
		expect(html).toContain("your site");
	});

	test("defaults to kind='down' when kind is missing", async () => {
		const html = await render({ url: "https://example.com" });
		expect(html).toContain("is down");
		expect(html).not.toContain("back up");
	});

	test("dashboardUrl absent → no dashboard button", async () => {
		const html = await render({ kind: "down", url: "https://example.com" });
		expect(html).not.toContain("View in Databuddy");
	});

	test("dashboardUrl present → dashboard button appears with that href", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			dashboardUrl: "https://app.databuddy.cc/monitors/abc123",
		});
		expect(html).toContain("View in Databuddy");
		expect(html).toContain("https://app.databuddy.cc/monitors/abc123");
	});
});

describe("UptimeAlertEmail — down vs recovered variants", () => {
	test("down variant uses the down copy and red accent", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "acme.com",
			url: "https://acme.com",
		});
		expect(html).toContain("acme.com is down");
		expect(html).toContain("could not reach this URL");
		expect(html.toLowerCase()).toContain("#dc2626");
	});

	test("recovered variant uses the recovery copy and green accent", async () => {
		const html = await render({
			kind: "recovered",
			siteLabel: "acme.com",
			url: "https://acme.com",
		});
		expect(html).toContain("acme.com is back up");
		expect(html).toContain("latest health check succeeded");
		expect(html.toLowerCase()).toContain("#22c55e");
	});

	test("recovered variant omits the error line even if error is passed", async () => {
		const html = await render({
			kind: "recovered",
			url: "https://acme.com",
			error: "This error should not appear",
		});
		expect(html).not.toContain("This error should not appear");
	});

	test("down variant with empty error hides the error block", async () => {
		const html = await render({
			kind: "down",
			url: "https://acme.com",
			error: "   \n\t  ",
		});
		expect(html).not.toContain("Error · ");
	});

	test("down variant trims leading/trailing whitespace from error", async () => {
		const html = await render({
			kind: "down",
			url: "https://acme.com",
			error: "   Timeout after 60000ms   ",
		});
		expect(html).toContain("Timeout after 60000ms");
		expect(html).not.toContain("   Timeout after 60000ms");
	});
});

describe("UptimeAlertEmail — timing and numeric edge cases", () => {
	test("HTTP 0 (timeout) renders literally as 0", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			httpCode: 0,
		});
		expect(html).toMatch(/HTTP.*·.*0/);
	});

	test("checkedAt undefined renders em-dash placeholder", async () => {
		const html = await render({ kind: "down", url: "https://example.com" });
		expect(html).toMatch(/Checked at.*·.*—/);
	});

	test("checkedAt = NaN renders em-dash (not 'Invalid Date')", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			checkedAt: Number.NaN,
		});
		expect(html).not.toContain("Invalid Date");
		expect(html).toMatch(/Checked at.*·.*—/);
	});

	test("checkedAt = Infinity renders em-dash", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			checkedAt: Number.POSITIVE_INFINITY,
		});
		expect(html).not.toContain("Invalid Date");
		expect(html).toMatch(/Checked at.*·.*—/);
	});

	test("checkedAt = 0 (epoch) renders a formatted date, not em-dash", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			checkedAt: 0,
		});
		expect(html).toContain("1970");
	});

	test("fractional ttfb/total values round to integers", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			ttfbMs: 123.7,
			totalMs: 456.49,
		});
		expect(html).toContain("TTFB 124 ms");
		expect(html).toContain("total 456 ms");
	});

	test("ttfb/total undefined hide the Response row", async () => {
		const html = await render({ kind: "down", url: "https://example.com" });
		expect(html).not.toContain("Response · ");
	});

	test("only one of ttfb/total present still renders the Response row", async () => {
		const htmlA = await render({
			kind: "down",
			url: "https://example.com",
			ttfbMs: 50,
		});
		expect(htmlA).toContain("TTFB 50 ms");

		const htmlB = await render({
			kind: "down",
			url: "https://example.com",
			totalMs: 200,
		});
		expect(htmlB).toContain("total 200 ms");
	});
});

describe("UptimeAlertEmail — SSL row", () => {
	test("sslValid undefined → no SSL row", async () => {
		const html = await render({ kind: "down", url: "https://example.com" });
		expect(html).not.toContain("SSL · ");
	});

	test("sslValid true with expiry renders 'Valid · expires …'", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			sslValid: true,
			sslExpiryMs: Date.UTC(2030, 0, 15),
		});
		expect(html).toContain("Valid");
		expect(html).toContain("2030");
	});

	test("sslValid true with no expiry renders just 'Valid'", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			sslValid: true,
		});
		expect(html).toContain("Valid");
		expect(html).not.toContain("expires");
	});

	test("sslValid false renders 'Invalid'", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			sslValid: false,
		});
		expect(html).toContain("Invalid");
	});

	test("sslExpiryMs = 0 is treated as missing", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			sslValid: true,
			sslExpiryMs: 0,
		});
		expect(html).not.toContain("expires");
	});

	test("sslExpiryMs = Infinity is treated as missing", async () => {
		const html = await render({
			kind: "down",
			url: "https://example.com",
			sslValid: true,
			sslExpiryMs: Number.POSITIVE_INFINITY,
		});
		expect(html).not.toContain("expires");
	});
});

describe("UptimeAlertEmail — preview text", () => {
	test.each([
		["down", "failed health check — HTTP timeout"],
		["recovered", "is responding normally again"],
	] as const)("%s preview matches current copy", async (kind, copy) => {
		const html = await render({ kind, url: "https://example.com" });
		expect(html).toContain(copy);
	});
});

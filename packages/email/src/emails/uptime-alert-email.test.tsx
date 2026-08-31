/** biome-ignore-all lint/performance/useTopLevelRegex: it's a test file */
import { describe, expect, test } from "bun:test";
import { render as renderEmail } from "@react-email/render";
import { UptimeAlertEmail } from "./uptime-alert-email";

type Props = Parameters<typeof UptimeAlertEmail>[0];

function render(props: Props): Promise<string> {
	return renderEmail(UptimeAlertEmail(props));
}

function renderText(props: Props): Promise<string> {
	return renderEmail(UptimeAlertEmail(props), { plainText: true });
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
});

describe("UptimeAlertEmail — field fallbacks and optional props", () => {
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
		expect(html).toContain("Health check failed for");
		expect(html).not.toContain("Health check passed for");
	});

	test("dashboardUrl absent → no dashboard button", async () => {
		const html = await render({ kind: "down", url: "https://example.com" });
		expect(html).not.toContain("View in Databuddy");
	});
});

describe("UptimeAlertEmail — down vs recovered variants", () => {
	test("down variant does not describe an HTTP error response as unreachable", async () => {
		const html = await render({
			kind: "down",
			siteLabel: "acme.com",
			url: "https://acme.com",
			httpCode: 503,
		});
		expect(html).toContain("received an HTTP response");
		expect(html).toContain("did not meet the monitor&#x27;s success criteria");
		expect(html).not.toContain("could not reach");
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
	test("HTTP 0 renders as no HTTP response", async () => {
		const text = await renderText({
			kind: "down",
			url: "https://example.com",
			httpCode: 0,
		});
		expect(text).toContain("HTTP · No HTTP response");
		expect(text).not.toContain("HTTP · 0");
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

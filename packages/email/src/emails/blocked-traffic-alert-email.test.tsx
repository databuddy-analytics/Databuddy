import { render as renderEmail } from "react-email";
import { describe, expect, test } from "bun:test";
import { BlockedTrafficAlertEmail } from "./blocked-traffic-alert-email";

describe("BlockedTrafficAlertEmail", () => {
	test("critical tracking-zero copy includes the site and counts", async () => {
		const html = await renderEmail(
			BlockedTrafficAlertEmail({
				baselineEvents: 123,
				blockedCount: 4,
				recentEvents: 0,
				severity: "critical",
				siteLabel: "Example Site",
				windowMinutes: 15,
			})
		);

		expect(html).toContain("Tracking may be down for Example Site");
		expect(html).toContain("Blocked");
		expect(html).toContain("4");
		expect(html).toContain("15");
		expect(html).toContain("Recent pageviews");
		expect(html).toContain("30");
	});

	test("warning copy is distinct from tracking-zero", async () => {
		const html = await renderEmail(
			BlockedTrafficAlertEmail({
				blockedCount: 25,
				severity: "warning",
				siteLabel: "Docs",
			})
		);

		expect(html).toContain("Blocked tracking increased for Docs");
		expect(html).not.toContain("Tracking may be down for Docs");
	});

	test("includes safe dashboard link only when provided", async () => {
		const withLink = await renderEmail(
			BlockedTrafficAlertEmail({ dashboardUrl: "https://app.databuddy.cc/x" })
		);
		const withoutLink = await renderEmail(BlockedTrafficAlertEmail({}));

		expect(withLink).toContain("Open website settings");
		expect(withLink).toContain("https://app.databuddy.cc/x");
		expect(withoutLink).not.toContain("Open website settings");
	});

	test("escapes user-controlled strings", async () => {
		const html = await renderEmail(
			BlockedTrafficAlertEmail({
				fix: "<img src=x onerror=alert(1)>",
				origin: "https://evil.test/?x=<script>alert(1)</script>",
				siteLabel: "<script>alert(1)</script>",
			})
		);

		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).not.toContain("<img src=x onerror=alert(1)>");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	});
});

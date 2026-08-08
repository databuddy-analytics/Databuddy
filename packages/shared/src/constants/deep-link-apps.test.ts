import { describe, expect, test } from "bun:test";
import {
	DEEP_LINK_APP_IDS,
	DEEP_LINK_APPS,
	getDeepLinkAppByHostname,
	isDeepLinkTarget,
	resolveDeepLink,
} from "./deep-link-apps";

describe("deep-link app targets", () => {
	test("keeps the public ID tuple aligned with the app registry", () => {
		expect(DEEP_LINK_APPS.map((app) => app.id)).toEqual(DEEP_LINK_APP_IDS);
	});

	test("resolves a registered HTTPS target", () => {
		expect(
			resolveDeepLink("instagram", "https://www.instagram.com/databuddy")
		).toBe("instagram://user?username=databuddy");
	});

	test("requires the selected app hostname", () => {
		expect(
			resolveDeepLink("facebook", "https://not-facebook.example/promo")
		).toBeNull();
		expect(
			resolveDeepLink("instagram", "https://instagram.com.attacker.example/promo")
		).toBeNull();
	});

	test("rejects unknown, malformed, and non-HTTPS targets", () => {
		expect(resolveDeepLink("unknown", "https://example.com")).toBeNull();
		expect(resolveDeepLink("instagram", "http://instagram.com/databuddy")).toBeNull();
		expect(resolveDeepLink("instagram", "not a URL")).toBeNull();
		expect(isDeepLinkTarget("instagram", "javascript:alert(1)")).toBe(false);
	});

	test("normalizes hostname lookup", () => {
		expect(getDeepLinkAppByHostname("WWW.Instagram.COM")?.id).toBe(
			"instagram"
		);
	});
});

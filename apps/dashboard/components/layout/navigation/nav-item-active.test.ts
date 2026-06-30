import { existsSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { getActivePageNavigationTabId } from "../page-navigation-active";
import { isNavItemActive } from "./nav-item-active";
import { websiteNavigation } from "./navigation-config";
import type { NavigationItem } from "./types";

const TestIcon = () => null;

function navItem(
	href: string,
	options: Partial<NavigationItem> = {}
): NavigationItem {
	return {
		name: "Item",
		icon: TestIcon,
		href,
		rootLevel: true,
		...options,
	};
}

describe("navigation active matching", () => {
	it("keeps root items exact by default", () => {
		const item = navItem("/events");

		expect(isNavItemActive(item, "/events")).toBe(true);
		expect(isNavItemActive(item, "/events/stream")).toBe(false);
	});

	it("supports explicit root prefix matching without sibling drift", () => {
		const item = navItem("/events", { activeMatch: "prefix" });

		expect(isNavItemActive(item, "/events/stream")).toBe(true);
		expect(isNavItemActive(item, "/events-archive")).toBe(false);
	});

	it("supports root prefix exclusions", () => {
		const item = navItem("/monitors", {
			activeMatch: "prefix",
			activePathExclusions: ["/monitors/status-pages"],
		});

		expect(isNavItemActive(item, "/monitors/abc")).toBe(true);
		expect(isNavItemActive(item, "/monitors/status-pages")).toBe(false);
		expect(isNavItemActive(item, "/monitors/status-pages/abc")).toBe(false);
	});

	it("matches website nav items inside the active website only", () => {
		const item = navItem("/events", { rootLevel: false });

		expect(isNavItemActive(item, "/websites/site_123/events", "site_123")).toBe(
			true
		);
		expect(
			isNavItemActive(item, "/websites/site_456/events", "site_123")
		).toBe(false);
	});
});

describe("page navigation active matching", () => {
	const tabs = [
		{ id: "summary", href: "/events" },
		{ id: "stream", href: "/events/stream" },
	];

	it("uses the longest matching tab for nested toolbar routes", () => {
		expect(getActivePageNavigationTabId(tabs, "/events/stream/live")).toBe(
			"stream"
		);
	});

	it("does not match similarly prefixed sibling paths", () => {
		expect(getActivePageNavigationTabId(tabs, "/events-archive")).toBeNull();
	});
});

describe("demo website navigation", () => {
	const demoRoot = new URL("../../../app/demo/[id]/", import.meta.url);
	const websiteItems = websiteNavigation.flatMap((group) => group.items);

	it("hides demo-unsafe or unavailable website surfaces", () => {
		const hiddenHrefs = new Set([
			"/realtime",
			"/anomalies",
			"/users",
			"/flags",
			"/revenue",
			"/agent",
			"/settings/general",
			"/settings/security",
			"/settings/transfer",
			"/settings/export",
			"/settings/tracking",
		]);

		for (const href of hiddenHrefs) {
			const item = websiteItems.find((candidate) => candidate.href === href);
			expect(item?.hideFromDemo, href).toBe(true);
		}
	});

	it("only shows website-level demo nav items with real demo pages", () => {
		const visibleDemoItems = websiteItems.filter(
			(item) => item.rootLevel === false && !item.hideFromDemo
		);

		for (const item of visibleDemoItems) {
			const pagePath = item.href === "" ? "page.tsx" : `${item.href.slice(1)}/page.tsx`;
			expect(existsSync(new URL(pagePath, demoRoot)), item.href || "/").toBe(
				true
			);
		}
	});
});

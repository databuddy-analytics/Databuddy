import { describe, expect, it } from "bun:test";
import { dashboardActionsSchema } from "./ai-components/schemas";
import {
	buildDashboardActionHref,
	parseDashboardFiltersParam,
	serializeDashboardFilters,
} from "./dashboard-navigation-actions";

describe("dashboard navigation actions", () => {
	it("builds semantic website target hrefs", () => {
		expect(
			buildDashboardActionHref({
				currentWebsiteId: "site_123",
				target: "website.events",
			})
		).toBe("/websites/site_123/events");

		expect(
			buildDashboardActionHref({
				currentWebsiteId: "site_123",
				eventName: "signup completed",
				target: "website.event",
			})
		).toBe("/websites/site_123/events/signup%20completed");
	});

	it("rejects website targets without a website id", () => {
		expect(buildDashboardActionHref({ target: "website.events" })).toBeNull();
		expect(
			buildDashboardActionHref({
				currentWebsiteId: "site_123",
				target: "website.event",
			})
		).toBeNull();
	});

	it("ignores unknown targets and falls back to safe hrefs", () => {
		expect(
			buildDashboardActionHref({
				currentWebsiteId: "site_123",
				target: "website.settings",
			})
		).toBeNull();

		expect(
			buildDashboardActionHref({
				currentWebsiteId: "site_123",
				href: "/websites/{websiteId}/settings",
				target: "website.settings",
			})
		).toBe("/websites/site_123/settings");
	});

	it("rejects external and unsafe hrefs", () => {
		expect(
			buildDashboardActionHref({ href: "https://example.com/websites" })
		).toBeNull();
		expect(buildDashboardActionHref({ href: "//example.com/home" })).toBeNull();
		expect(buildDashboardActionHref({ href: "/unknown" })).toBeNull();
	});

	it("preserves analytics params and applies explicit filters", () => {
		const filters = [
			{ field: "event_name", operator: "eq", value: "checkout_started" },
		] as const;
		const href = buildDashboardActionHref({
			currentSearchParams: new URLSearchParams(
				"startDate=2026-04-12&endDate=2026-05-12&granularity=daily"
			),
			currentWebsiteId: "site_123",
			filters: [...filters],
			params: { propKey: "plan", propVal: "pro" },
			target: "website.events.stream",
		});

		expect(href).not.toBeNull();
		const url = new URL(href ?? "", "https://dashboard.databuddy.local");
		expect(url.pathname).toBe("/websites/site_123/events/stream");
		expect(url.searchParams.get("startDate")).toBe("2026-04-12");
		expect(url.searchParams.get("endDate")).toBe("2026-05-12");
		expect(url.searchParams.get("granularity")).toBe("daily");
		expect(url.searchParams.get("propKey")).toBe("plan");
		expect(url.searchParams.get("propVal")).toBe("pro");
		expect(url.searchParams.get("filters")).toBe(
			serializeDashboardFilters([...filters])
		);
	});

	it("round-trips valid filters and rejects invalid filter payloads", () => {
		const filters = [
			{ field: "utm_source", operator: "eq", value: "linkedin" },
			{ field: "path", operator: "in", value: ["/", "/pricing"] },
		] as const;

		expect(parseDashboardFiltersParam(serializeDashboardFilters([...filters]))).toEqual(
			[...filters]
		);
		expect(
			parseDashboardFiltersParam(
				JSON.stringify([{ field: "utm_source", operator: "bad", value: "x" }])
			)
		).toBeNull();
	});

	it("accepts target-only dashboard action schema payloads", () => {
		expect(
			dashboardActionsSchema.safeParse({
				type: "dashboard-actions",
				websiteId: "site_123",
				actions: [
					{
						label: "Open events",
						target: "website.events",
						filters: [
							{
								field: "event_name",
								operator: "eq",
								value: "signup_completed",
							},
						],
					},
				],
			}).success
		).toBe(true);
	});

	it("accepts generated string targets at the component boundary", () => {
		expect(
			dashboardActionsSchema.safeParse({
				type: "dashboard-actions",
				websiteId: "site_123",
				actions: [
					{
						label: "Settings",
						target: "website.settings",
					},
				],
			}).success
		).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";
import {
	type ImportedEvent,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
} from "@databuddy/shared/import/records";
import { countryName, liveOverlapFilter, synthesizeDate } from "./pipeline";

const DATE = "2026-03-04";

function context(timezone = "UTC") {
	return {
		domain: "example.com",
		runId: "run-1",
		timezone,
		websiteId: "website-1",
	};
}

function bucket(
	totals: {
		bounces?: number;
		durationSeconds?: number;
		pageviews?: number;
		visitors?: number;
		visits?: number;
	},
	pages: [string, number][],
	dimensions?: Map<"country" | "source", { pageviews: number; value: string }[]>
) {
	return {
		dimensions: dimensions ?? new Map(),
		pages: pages.map(([path, pageviews]) => ({ path, pageviews })),
		totals,
	};
}

function sessionRollups(events: ImportedEvent[]) {
	const sessions = new Map<
		string,
		{ durationSeconds: number | null; engagement: number; pageCount: number }
	>();
	for (const event of events) {
		const rollup = sessions.get(event.sessionKey) ?? {
			durationSeconds: null,
			engagement: 0,
			pageCount: 0,
		};
		if (event.eventName === PAGEVIEW_EVENT_NAME) {
			rollup.pageCount += 1;
		} else if (event.eventName !== PAGE_EXIT_EVENT_NAME) {
			rollup.engagement += 1;
		}
		const timeOnPage = event.timeOnPage ?? 0;
		if (event.eventName === PAGE_EXIT_EVENT_NAME && timeOnPage > 0) {
			rollup.durationSeconds = (rollup.durationSeconds ?? 0) + timeOnPage;
		}
		sessions.set(event.sessionKey, rollup);
	}
	return [...sessions.values()];
}

function dashboardMetrics(events: ImportedEvent[]) {
	const rollups = sessionRollups(events);
	const pageviews = events.filter(
		(event) => event.eventName === PAGEVIEW_EVENT_NAME
	);
	return {
		bounces: rollups.filter(
			(rollup) =>
				rollup.pageCount === 1 &&
				rollup.durationSeconds !== null &&
				rollup.durationSeconds < 10 &&
				rollup.engagement === 0
		).length,
		durationSeconds: rollups.reduce(
			(total, rollup) => total + (rollup.durationSeconds ?? 0),
			0
		),
		pageviews: pageviews.length,
		visitors: new Set(pageviews.map((event) => event.visitorKey)).size,
		visits: rollups.filter((rollup) => rollup.pageCount >= 1).length,
	};
}

describe("rollup synthesis reproduces the source totals", () => {
	test.each([
		[
			"a typical day",
			{ bounces: 60, durationSeconds: 9000, visitors: 100, visits: 150 },
			[
				["/", 200],
				["/pricing", 120],
				["/docs", 80],
			] as [string, number][],
		],
		[
			"a day that is entirely bounces",
			{ bounces: 50, durationSeconds: 200, visitors: 50, visits: 50 },
			[["/", 50]] as [string, number][],
		],
		[
			"a duration that does not divide evenly",
			{ bounces: 3, durationSeconds: 1001, visitors: 7, visits: 11 },
			[
				["/a", 20],
				["/b", 21],
			] as [string, number][],
		],
		[
			"a day with no bounces at all",
			{ bounces: 0, durationSeconds: 3600, visitors: 10, visits: 10 },
			[["/x", 90]] as [string, number][],
		],
	])("%s", (_label, totals, pages) => {
		const { events } = synthesizeDate(DATE, bucket(totals, pages), context());
		const metrics = dashboardMetrics(events);

		expect(metrics.visitors).toBe(totals.visitors);
		expect(metrics.visits).toBe(totals.visits);
		expect(metrics.pageviews).toBe(
			pages.reduce((total, [, pageviews]) => total + pageviews, 0)
		);
		expect(metrics.bounces).toBe(totals.bounces);
		expect(metrics.durationSeconds).toBe(totals.durationSeconds);
	});
});

describe("rollup synthesis edge cases", () => {
	test("every bounce carries a page_exit row, because summing no rows yields NULL", () => {
		const { events } = synthesizeDate(
			DATE,
			bucket({ bounces: 40, durationSeconds: 320, visitors: 40, visits: 40 }, [
				["/", 40],
			]),
			context()
		);

		const exits = events.filter(
			(event) => event.eventName === PAGE_EXIT_EVENT_NAME
		);
		expect(exits).toHaveLength(40);
		for (const exit of exits) {
			expect(exit.timeOnPage).toBeGreaterThan(0);
			expect(exit.timeOnPage).toBeLessThan(10);
		}
	});

	test.each([
		["a day of single-pageview visits", 1440, 2880, "UTC"],
		["one visit with thousands of pageviews", 1, 5000, "UTC"],
		["a zone fourteen hours ahead of UTC", 5, 20, "Pacific/Kiritimati"],
	])("keeps every event inside the source date: %s", (_label, visits, pageviews, timezone) => {
		const { events } = synthesizeDate(
			DATE,
			bucket({ bounces: 0, durationSeconds: 600, visitors: visits, visits }, [
				["/", pageviews],
			]),
			context(timezone)
		);

		const localDate = new Intl.DateTimeFormat("en-CA", {
			day: "2-digit",
			month: "2-digit",
			timeZone: timezone,
			year: "numeric",
		});
		const dates = new Set(events.map((event) => localDate.format(event.time)));
		expect([...dates]).toEqual([DATE]);
	});

	test("reports dropped visits when the source claims more visits than pageviews", () => {
		const { events, adjustments } = synthesizeDate(
			DATE,
			bucket(
				{ bounces: 100, durationSeconds: 400, visitors: 200, visits: 300 },
				[["/", 50]]
			),
			context()
		);

		expect(adjustments.droppedVisits).toBe(250);
		expect(dashboardMetrics(events).visits).toBe(50);
	});

	test("small referrers do not take whole sessions from direct traffic", () => {
		const { events } = synthesizeDate(
			DATE,
			bucket(
				{ bounces: 0, durationSeconds: 600, visitors: 10, visits: 10 },
				[["/", 100]],
				new Map([
					[
						"source" as const,
						[
							{ pageviews: 30, value: "https://google.com" },
							...["a", "b", "c", "d", "e"].map((name) => ({
								pageviews: 1,
								value: `https://${name}.example`,
							})),
						],
					],
				])
			),
			context()
		);

		const byReferrer = new Map<string, number>();
		for (const event of events) {
			if (event.eventName === PAGEVIEW_EVENT_NAME) {
				const key = event.referrer ?? "direct";
				byReferrer.set(key, (byReferrer.get(key) ?? 0) + 1);
			}
		}
		expect(byReferrer.get("https://google.com")).toBe(30);
		expect(byReferrer.get("direct")).toBe(70);
	});

	test("assigns dimension pageviews in proportion to the source", () => {
		const { events } = synthesizeDate(
			DATE,
			bucket(
				{ bounces: 60, durationSeconds: 9000, visitors: 100, visits: 150 },
				[
					["/", 200],
					["/docs", 200],
				],
				new Map([
					[
						"country" as const,
						[
							{ pageviews: 240, value: "DE" },
							{ pageviews: 120, value: "US" },
							{ pageviews: 40, value: "FR" },
						],
					],
				])
			),
			context()
		);

		const byCountry = new Map<string, number>();
		for (const event of events) {
			if (event.eventName !== PAGEVIEW_EVENT_NAME || !event.country) {
				continue;
			}
			byCountry.set(event.country, (byCountry.get(event.country) ?? 0) + 1);
		}

		expect(byCountry.get("DE")).toBeCloseTo(240, -1);
		expect(byCountry.get("US")).toBeCloseTo(120, -1);
		expect(byCountry.get("FR")).toBeCloseTo(40, -1);
	});
});

describe("imports never overlap live tracking", () => {
	const firstLive = Date.parse("2026-09-26T23:09:39.558Z");
	const overlapsLive = liveOverlapFilter(
		new Map([["2026-09-26", firstLive]]),
		"UTC"
	);

	test("keeps the install day up to the first tracked event", () => {
		expect(overlapsLive(new Date("2026-09-26T12:00:00Z"))).toBe(false);
		expect(overlapsLive(new Date(firstLive))).toBe(true);
		expect(overlapsLive(new Date("2026-09-26T23:30:00Z"))).toBe(true);
	});

	test("leaves days without tracked data alone", () => {
		expect(overlapsLive(new Date("2026-09-25T23:30:00Z"))).toBe(false);
	});

	test("matches days in the import timezone", () => {
		const newYork = liveOverlapFilter(
			new Map([["2026-09-26", Date.parse("2026-09-26T04:00:00Z")]]),
			"America/New_York"
		);
		expect(newYork(new Date("2026-09-27T02:00:00Z"))).toBe(true);
		expect(newYork(new Date("2026-09-26T02:00:00Z"))).toBe(false);
	});
});

describe("imported countries use the names live tracking stores", () => {
	test("expands codes to MaxMind names", () => {
		expect(countryName("US")).toBe("United States");
		expect(countryName("in")).toBe("India");
		expect(countryName("NL")).toBe("The Netherlands");
		expect(countryName("CI")).toBe("Ivory Coast");
	});

	test("keeps names and empty values as they are", () => {
		expect(countryName("Germany")).toBe("Germany");
		expect(countryName("")).toBeNull();
		expect(countryName(null)).toBeNull();
	});
});

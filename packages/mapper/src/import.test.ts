import { describe, expect, it } from "bun:test";
import { mapUmamiRow, type UmamiCsvRow } from "./adapters";
import { createImport } from "./import";
import type { ImportContext } from "./types";

function umamiRow(overrides: Partial<UmamiCsvRow>): UmamiCsvRow {
	return {
		browser: "chrome",
		city: "Berlin",
		country: "DE",
		created_at: "2026-05-01T10:00:00.000Z",
		device: "desktop",
		distinct_id: "visitor-1",
		event_id: "event-1",
		event_name: "pageview",
		event_type: "1",
		fbclid: "",
		gclid: "",
		hostname: "example.com",
		job_id: "job-1",
		language: "de-DE",
		li_fat_id: "",
		msclkid: "",
		os: "macOS",
		page_title: "Home",
		referrer_domain: "google.com",
		referrer_path: "/",
		referrer_query: "",
		region: "BE",
		screen: "1920x1080",
		session_id: "session-1",
		tag: "",
		ttclid: "",
		twclid: "",
		url_path: "/home",
		url_query: "",
		utm_campaign: "spring",
		utm_content: "",
		utm_medium: "cpc",
		utm_source: "google",
		utm_term: "",
		visit_id: "visit-1",
		website_id: "site-1",
		...overrides,
	};
}

const noExitContext: ImportContext = {
	clientId: "client-1",
	isLastInSession: () => false,
};

describe("createImport", () => {
	it("marks only the chronologically last event of each session as page_exit", () => {
		const rows = [
			umamiRow({
				event_id: "a1",
				session_id: "s1",
				created_at: "2026-05-01T10:00:00.000Z",
			}),
			umamiRow({
				event_id: "a2",
				session_id: "s1",
				created_at: "2026-05-01T10:05:00.000Z",
			}),
			umamiRow({
				event_id: "b1",
				session_id: "s2",
				created_at: "2026-05-01T09:00:00.000Z",
			}),
		];

		const events = createImport({
			clientId: "client-1",
			rows,
			mapper: mapUmamiRow,
			getSessionId: (row) => row.session_id,
			getEventId: (row) => row.event_id,
			getTime: (row) => new Date(row.created_at).getTime(),
		});

		expect(events.map((event) => event.event_name)).toEqual([
			"screen_view",
			"page_exit",
			"page_exit",
		]);
	});

	it("keeps events without a session id as plain screen views", () => {
		const events = createImport({
			clientId: "client-1",
			rows: [umamiRow({ event_id: "a1", session_id: "" })],
			mapper: mapUmamiRow,
			getSessionId: (row) => row.session_id,
			getEventId: (row) => row.event_id,
			getTime: (row) => new Date(row.created_at).getTime(),
		});

		expect(events[0].event_name).toBe("screen_view");
	});

});

describe("mapUmamiRow", () => {
	it("title-cases hyphenated browser names", () => {
		const browserName = (browser: string) =>
			mapUmamiRow(umamiRow({ browser }), noExitContext).browser_name;

		expect(browserName("mobile-safari")).toBe("Mobile Safari");
		expect(browserName("chrome")).toBe("Chrome");
		expect(browserName("EDGE")).toBe("Edge");
		expect(browserName("")).toBe("");
	});

	it("falls back to a generated anonymous id for missing distinct ids", () => {
		const event = mapUmamiRow(umamiRow({ distinct_id: "" }), noExitContext);
		expect(event.anonymous_id).toStartWith("anon_");
	});

	it("generates a distinct anonymous id per unidentified row", () => {
		const first = mapUmamiRow(umamiRow({ distinct_id: "" }), noExitContext);
		const second = mapUmamiRow(umamiRow({ distinct_id: "" }), noExitContext);
		expect(first.anonymous_id).not.toBe(second.anonymous_id);
	});

	it("normalizes blank referrers to direct", () => {
		expect(
			mapUmamiRow(umamiRow({ referrer_domain: "" }), noExitContext).referrer
		).toBe("direct");
		expect(
			mapUmamiRow(umamiRow({ referrer_domain: "   " }), noExitContext).referrer
		).toBe("direct");
	});

	it("marks the session exit event via the import context", () => {
		const event = mapUmamiRow(umamiRow({}), {
			clientId: "client-1",
			isLastInSession: (eventId) => eventId === "event-1",
		});
		expect(event.event_name).toBe("page_exit");
	});
});

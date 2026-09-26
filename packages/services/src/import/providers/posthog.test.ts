import { describe, expect, test } from "bun:test";
import {
	type ImportContext,
	type ImportRecord,
	type ImportSource,
	PAGE_EXIT_EVENT_NAME,
	PAGEVIEW_EVENT_NAME,
} from "../pipeline";
import { posthogProvider } from "./posthog";

type EventRecord = Extract<ImportRecord, { grain: "event" }>;

const CONTEXT: ImportContext = {
	domain: "example.com",
	runId: "run-1",
	timezone: "UTC",
	websiteId: "website-1",
};

function source(lines: unknown[]): ImportSource {
	const body = lines
		.map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
		.join("\n");
	return {
		kind: "file",
		name: "export.jsonl",
		text: () => Promise.resolve(body),
	};
}

async function parse(lines: unknown[]): Promise<EventRecord[]> {
	const records: EventRecord[] = [];
	for await (const record of posthogProvider.parse(source(lines), CONTEXT)) {
		if (record.grain === "event") {
			records.push(record);
		}
	}
	return records;
}

function pageview(
	timestamp: string,
	url: string,
	overrides: Record<string, unknown> = {}
) {
	return {
		distinct_id: "person-a",
		event: "$pageview",
		properties: { $current_url: url, $session_id: "session-1" },
		timestamp,
		...overrides,
	};
}

describe("posthog provider", () => {
	test("detects a batch export and rejects unrelated json", async () => {
		await expect(
			posthogProvider.detect(
				source([pageview("2026-03-04T10:00:00Z", "https://example.com/a")])
			)
		).resolves.toBe(true);
		await expect(
			posthogProvider.detect(source([{ hello: "world" }]))
		).resolves.toBe(false);
	});

	test("keeps importing when a row carries null properties", async () => {
		const records = await parse([
			{
				distinct_id: "person-a",
				event: "$pageview",
				properties: "null",
				timestamp: "2026-03-04T10:00:00Z",
			},
			pageview("2026-03-04T11:00:00Z", "https://example.com/a"),
		]);

		expect(
			records.filter((record) => record.eventName === PAGEVIEW_EVENT_NAME)
		).toHaveLength(2);
	});

	test("drops pageviews from other hostnames but keeps subdomains", async () => {
		const records = await parse([
			pageview("2026-03-04T10:00:00Z", "https://example.com/a"),
			pageview("2026-03-04T10:00:10Z", "https://blog.example.com/b"),
			pageview("2026-03-04T10:00:20Z", "https://other.com/c"),
		]);

		expect(
			records
				.filter((record) => record.eventName === PAGEVIEW_EVENT_NAME)
				.map((record) => record.path)
		).toEqual(["/a", "/b"]);
	});

	test("charges each page for its own dwell time", async () => {
		const records = await parse([
			pageview("2026-03-04T10:00:00Z", "https://example.com/a"),
			pageview("2026-03-04T10:00:30Z", "https://example.com/b"),
			pageview("2026-03-04T10:01:30Z", "https://example.com/c"),
		]);

		expect(
			records
				.filter((record) => record.eventName === PAGE_EXIT_EVENT_NAME)
				.map((record) => [record.path, record.timeOnPage])
		).toEqual([
			["/a", 30],
			["/b", 60],
			["/c", 1],
		]);
	});

	test("keeps a late exit on the day of its pageview", async () => {
		const records = await parse([
			pageview("2026-03-04T23:59:59Z", "https://example.com/a"),
		]);
		const exit = records.find(
			(record) => record.eventName === PAGE_EXIT_EVENT_NAME
		);

		expect(exit?.time.toISOString().slice(0, 10)).toBe("2026-03-04");
	});

	test("splits a shared session id across different visitors", async () => {
		const records = await parse([
			pageview("2026-03-04T10:00:00Z", "https://example.com/a"),
			pageview("2026-03-04T10:00:10Z", "https://example.com/b", {
				distinct_id: "person-b",
			}),
		]);
		const exits = records.filter(
			(record) => record.eventName === PAGE_EXIT_EVENT_NAME
		);

		expect(new Set(records.map((record) => record.sessionKey)).size).toBe(2);
		expect(exits.map((record) => [record.visitorKey, record.path])).toEqual([
			["person-a", "/a"],
			["person-b", "/b"],
		]);
	});

	test("starts a new session after a thirty minute gap without a session id", async () => {
		const records = await parse([
			pageview("2026-03-04T10:00:00Z", "https://example.com/a", {
				properties: { $current_url: "https://example.com/a" },
			}),
			pageview("2026-03-04T11:00:00Z", "https://example.com/b", {
				properties: { $current_url: "https://example.com/b" },
			}),
		]);

		expect(new Set(records.map((record) => record.sessionKey)).size).toBe(2);
	});
});

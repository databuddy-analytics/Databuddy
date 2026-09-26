import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import type { ImportRecord } from "./pipeline";
import { plausibleProvider } from "./providers/plausible";
import { simpleAnalyticsProvider } from "./providers/simple-analytics";
import { fileSource, zipSource } from "./runner";

const OVERSIZED_BYTES = 40 * 1024 * 1024;

const VISITORS_CSV =
	"date,visitors,pageviews,bounces,visits,visit_duration\n2026-03-04,10,20,5,10,100\n";
const PAGES_CSV =
	"date,hostname,page,visits,visitors,pageviews\n2026-03-04,example.com,/,10,10,20\n";
const DATAPOINTS_CSV =
	"added_iso,hostname,path,is_unique,is_robot,duration_seconds\n2026-03-04T10:00:00Z,example.com,/,true,false,30\n";

function context() {
	return {
		domain: "example.com",
		runId: "run-1",
		timezone: "UTC",
		websiteId: "website-1",
	};
}

async function archive(entries: Record<string, string>) {
	const zip = new JSZip();
	for (const [name, contents] of Object.entries(entries)) {
		zip.file(name, contents);
	}
	return await zipSource(await zip.generateAsync({ type: "uint8array" }));
}

describe("archive traversal", () => {
	test("an oversized unrelated entry does not fail the import", async () => {
		const source = await archive({
			"imported_pages_20260304_20260304.csv": PAGES_CSV,
			"imported_visitors_20260304_20260304.csv": VISITORS_CSV,
			"unrelated-notes.txt": "x".repeat(OVERSIZED_BYTES),
		});

		expect(await plausibleProvider.detect(source)).toBe(true);

		const records: ImportRecord[] = [];
		for await (const record of plausibleProvider.parse(source, context())) {
			records.push(record);
		}
		expect(records).toHaveLength(2);
	});

	test("an oversized entry that is read is rejected", async () => {
		const source = await archive({
			"imported_visitors_20260304_20260304.csv": "y".repeat(OVERSIZED_BYTES),
		});

		const read = async () => {
			if (source.kind !== "archive") {
				throw new Error("expected an archive source");
			}
			for await (const entry of source.entries()) {
				await entry.text();
			}
		};
		expect(read()).rejects.toThrow(/over the .* byte limit/);
	});

	test("an archive with too many entries is rejected before any read", async () => {
		const entries: Record<string, string> = {};
		for (let i = 0; i < 100; i += 1) {
			entries[`file-${i}.csv`] = "a,b\n1,2\n";
		}
		const zip = new JSZip();
		for (const [name, contents] of Object.entries(entries)) {
			zip.file(name, contents);
		}
		const bytes = await zip.generateAsync({ type: "uint8array" });

		expect(zipSource(bytes)).rejects.toThrow(/more than the \d+/);
	});
});

describe("single file traversal", () => {
	test("an upload with no file extension is still detected", async () => {
		const source = fileSource(
			"imports/org-1/0198e3f2-4d5c-7000-8000-000000000000",
			DATAPOINTS_CSV
		);

		expect(await simpleAnalyticsProvider.detect(source)).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";
import { takeAuditExportPage } from "./audit";

describe("audit export paging", () => {
	test("caps a final page at 10,000 rows and marks the export truncated", () => {
		const currentEvents = Array.from({ length: 9_998 }, (_, index) => index);
		const rows = Array.from({ length: 101 }, (_, index) => index);

		const result = takeAuditExportPage(currentEvents, rows);

		expect(result.page).toEqual([0, 1]);
		expect(result.hasMore).toBe(true);
		expect(result.truncated).toBe(true);
	});

	test("does not mark an exact-cap export as truncated", () => {
		const currentEvents = Array.from({ length: 9_998 }, (_, index) => index);
		const rows = [0, 1];

		const result = takeAuditExportPage(currentEvents, rows);

		expect(result.page).toEqual(rows);
		expect(result.hasMore).toBe(false);
		expect(result.truncated).toBe(false);
	});
});

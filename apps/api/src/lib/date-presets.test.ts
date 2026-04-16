import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { resolveDatePreset } from "./date-presets";
import type { DatePreset } from "../schemas/query-schemas";

function fakeToday(dateStr: string) {
	const fakeNow = new Date(`${dateStr}T12:00:00Z`).getTime();
	const original = Date.now;
	Date.now = () => fakeNow;
	const _origDate = globalThis.Date;
	const OrigDate = Date;
	const FakeDate = function (...args: unknown[]) {
		if (args.length === 0) return new OrigDate(fakeNow);
		// @ts-expect-error - constructor forwarding
		return new OrigDate(...args);
	} as unknown as DateConstructor;
	FakeDate.now = () => fakeNow;
	FakeDate.parse = OrigDate.parse;
	FakeDate.UTC = OrigDate.UTC;
	FakeDate.prototype = OrigDate.prototype;
	globalThis.Date = FakeDate;
	return () => {
		Date.now = original;
		globalThis.Date = _origDate;
	};
}

describe("resolveDatePreset", () => {
	it("today returns current date for both from and to", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("today", "UTC");
			expect(result.from).toBe("2026-04-11");
			expect(result.to).toBe("2026-04-11");
			expect(result.startDate).toBe(result.from);
			expect(result.endDate).toBe(result.to);
		} finally {
			cleanup();
		}
	});

	it("yesterday returns the day before", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("yesterday", "UTC");
			expect(result.from).toBe("2026-04-10");
			expect(result.to).toBe("2026-04-10");
		} finally {
			cleanup();
		}
	});

	it("last_7d includes today and 6 prior days", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("last_7d", "UTC");
			expect(result.from).toBe("2026-04-05");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});

	it("last_14d spans 14 days", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("last_14d", "UTC");
			expect(result.from).toBe("2026-03-29");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});

	it("last_30d spans 30 days", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("last_30d", "UTC");
			expect(result.from).toBe("2026-03-13");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});

	it("last_90d spans 90 days", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("last_90d", "UTC");
			expect(result.from).toBe("2026-01-12");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});

	it("this_week starts on Sunday", () => {
		const cleanup = fakeToday("2026-04-08"); // Wednesday
		try {
			const result = resolveDatePreset("this_week", "UTC");
			expect(result.from).toBe("2026-04-05"); // Sunday
			expect(result.to).toBe("2026-04-08");
		} finally {
			cleanup();
		}
	});

	it("last_week returns full Sun-Sat of previous week", () => {
		const cleanup = fakeToday("2026-04-08"); // Wednesday
		try {
			const result = resolveDatePreset("last_week", "UTC");
			expect(result.from).toBe("2026-03-29"); // Previous Sunday
			expect(result.to).toBe("2026-04-04"); // Previous Saturday
		} finally {
			cleanup();
		}
	});

	it("this_month starts on the 1st", () => {
		const cleanup = fakeToday("2026-04-15");
		try {
			const result = resolveDatePreset("this_month", "UTC");
			expect(result.from).toBe("2026-04-01");
			expect(result.to).toBe("2026-04-15");
		} finally {
			cleanup();
		}
	});

	it("last_month returns full previous month", () => {
		const cleanup = fakeToday("2026-04-15");
		try {
			const result = resolveDatePreset("last_month", "UTC");
			expect(result.from).toBe("2026-03-01");
			expect(result.to).toBe("2026-03-31");
		} finally {
			cleanup();
		}
	});

	it("last_month handles February", () => {
		const cleanup = fakeToday("2026-03-15");
		try {
			const result = resolveDatePreset("last_month", "UTC");
			expect(result.from).toBe("2026-02-01");
			expect(result.to).toBe("2026-02-28");
		} finally {
			cleanup();
		}
	});

	it("this_year starts Jan 1", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset("this_year", "UTC");
			expect(result.from).toBe("2026-01-01");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});

	it("unknown preset falls back to today", () => {
		const cleanup = fakeToday("2026-04-11");
		try {
			const result = resolveDatePreset(
				"nonexistent" as DatePreset,
				"UTC"
			);
			expect(result.from).toBe("2026-04-11");
			expect(result.to).toBe("2026-04-11");
		} finally {
			cleanup();
		}
	});
});

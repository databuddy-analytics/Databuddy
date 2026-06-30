import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatePreset } from "../schemas/query-schemas";

function withFakeDate(dateStr: string, fn: () => void) {
	const fakeNow = new Date(`${dateStr}T12:00:00Z`).getTime();
	const OrigDate = globalThis.Date;

	const FakeDate = function (this: Date, ...args: unknown[]) {
		if (args.length === 0) return new OrigDate(fakeNow);
		// @ts-expect-error - constructor forwarding
		return new OrigDate(...args);
	} as unknown as DateConstructor;

	FakeDate.now = () => fakeNow;
	FakeDate.parse = OrigDate.parse.bind(OrigDate);
	FakeDate.UTC = OrigDate.UTC.bind(OrigDate);
	Object.setPrototypeOf(FakeDate.prototype, OrigDate.prototype);
	FakeDate.prototype.constructor = FakeDate;

	vi.stubGlobal("Date", FakeDate);
	try {
		fn();
	} finally {
		vi.stubGlobal("Date", OrigDate);
	}
}

describe("resolveDatePreset", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("today returns current date for both from and to", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("today", "UTC");
			expect(result.from).toBe("2026-04-11");
			expect(result.to).toBe("2026-04-11");
			expect(result.startDate).toBe(result.from);
			expect(result.endDate).toBe(result.to);
		});
	});

	it("yesterday returns the day before", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("yesterday", "UTC");
			expect(result.from).toBe("2026-04-10");
			expect(result.to).toBe("2026-04-10");
		});
	});

	it("last_7d includes today and 6 prior days", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("last_7d", "UTC");
			expect(result.from).toBe("2026-04-05");
			expect(result.to).toBe("2026-04-11");
		});
	});

	it("last_14d spans 14 days", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("last_14d", "UTC");
			expect(result.from).toBe("2026-03-29");
			expect(result.to).toBe("2026-04-11");
		});
	});

	it("last_30d spans 30 days", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("last_30d", "UTC");
			expect(result.from).toBe("2026-03-13");
			expect(result.to).toBe("2026-04-11");
		});
	});

	it("last_90d spans 90 days", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("last_90d", "UTC");
			expect(result.from).toBe("2026-01-12");
			expect(result.to).toBe("2026-04-11");
		});
	});

	it("this_week starts on Sunday", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-08", () => {
			const result = resolveDatePreset("this_week", "UTC");
			expect(result.from).toBe("2026-04-05");
			expect(result.to).toBe("2026-04-08");
		});
	});

	it("last_week returns full Sun-Sat of previous week", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-08", () => {
			const result = resolveDatePreset("last_week", "UTC");
			expect(result.from).toBe("2026-03-29");
			expect(result.to).toBe("2026-04-04");
		});
	});

	it("this_month starts on the 1st", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-15", () => {
			const result = resolveDatePreset("this_month", "UTC");
			expect(result.from).toBe("2026-04-01");
			expect(result.to).toBe("2026-04-15");
		});
	});

	it("last_month returns full previous month", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-15", () => {
			const result = resolveDatePreset("last_month", "UTC");
			expect(result.from).toBe("2026-03-01");
			expect(result.to).toBe("2026-03-31");
		});
	});

	it("last_month handles February", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-03-15", () => {
			const result = resolveDatePreset("last_month", "UTC");
			expect(result.from).toBe("2026-02-01");
			expect(result.to).toBe("2026-02-28");
		});
	});

	it("this_year starts Jan 1", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset("this_year", "UTC");
			expect(result.from).toBe("2026-01-01");
			expect(result.to).toBe("2026-04-11");
		});
	});

	it("unknown preset falls back to today", async () => {
		const { resolveDatePreset } = await import("@databuddy/ai/lib/date-presets");
		withFakeDate("2026-04-11", () => {
			const result = resolveDatePreset(
				"nonexistent" as DatePreset,
				"UTC"
			);
			expect(result.from).toBe("2026-04-11");
			expect(result.to).toBe("2026-04-11");
		});
	});
});

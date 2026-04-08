import { describe, expect, test } from "bun:test";
import {
	reshapeSocialReferrals,
	type SocialReferrerRow,
} from "../social-referrals";

const row = (overrides: Partial<SocialReferrerRow>): SocialReferrerRow => ({
	referrerUrl: "https://t.co/aaa",
	host: "t.co",
	sessions: 100,
	bouncedSessions: 20,
	avgDurationSeconds: 60,
	pageviews: 300,
	...overrides,
});

describe("reshapeSocialReferrals", () => {
	test("groups t.co and x.com under the twitter.com platform", () => {
		const rows: SocialReferrerRow[] = [
			row({ referrerUrl: "https://t.co/a", host: "t.co", sessions: 50, bouncedSessions: 10 }),
			row({ referrerUrl: "https://x.com/user/status/1", host: "x.com", sessions: 30, bouncedSessions: 5 }),
		];
		const result = reshapeSocialReferrals(rows);
		expect(result).toHaveLength(1);
		expect(result[0].host).toBe("twitter.com");
		expect(result[0].name).toBe("X / Twitter");
		expect(result[0].sessions).toBe(80);
		expect(result[0].bouncedSessions).toBe(15);
		expect(result[0].urls).toHaveLength(2);
	});

	test("sorts platforms by engaged sessions descending", () => {
		const rows: SocialReferrerRow[] = [
			row({ host: "linkedin.com", sessions: 200, bouncedSessions: 150 }),
			row({ host: "t.co", sessions: 100, bouncedSessions: 10 }),
			row({ host: "reddit.com", sessions: 80, bouncedSessions: 20 }),
		];
		const result = reshapeSocialReferrals(rows);
		expect(result.map((p) => p.host)).toEqual([
			"twitter.com", // 90 engaged
			"reddit.com", // 60 engaged
			"linkedin.com", // 50 engaged
		]);
	});

	test("sorts urls within a platform by engaged sessions descending", () => {
		const rows: SocialReferrerRow[] = [
			row({ referrerUrl: "https://t.co/a", sessions: 20, bouncedSessions: 15 }),
			row({ referrerUrl: "https://t.co/b", sessions: 100, bouncedSessions: 20 }),
			row({ referrerUrl: "https://t.co/c", sessions: 50, bouncedSessions: 10 }),
		];
		const result = reshapeSocialReferrals(rows);
		expect(result[0].urls.map((u) => u.referrerUrl)).toEqual([
			"https://t.co/b", // 80 engaged
			"https://t.co/c", // 40 engaged
			"https://t.co/a", // 5 engaged
		]);
	});

	test("computes platform avg duration as session-weighted average", () => {
		const rows: SocialReferrerRow[] = [
			row({ referrerUrl: "https://t.co/a", sessions: 100, avgDurationSeconds: 30 }),
			row({ referrerUrl: "https://t.co/b", sessions: 300, avgDurationSeconds: 90 }),
		];
		const result = reshapeSocialReferrals(rows);
		// (100*30 + 300*90) / 400 = 75
		expect(result[0].avgDurationSeconds).toBe(75);
	});

	test("honors maxUrlsPerPlatform", () => {
		const rows: SocialReferrerRow[] = Array.from({ length: 10 }, (_, i) =>
			row({ referrerUrl: `https://t.co/${i}`, sessions: 100 - i })
		);
		const result = reshapeSocialReferrals(rows, 3);
		expect(result[0].urls).toHaveLength(3);
	});

	test("returns empty array for empty input", () => {
		expect(reshapeSocialReferrals([])).toEqual([]);
	});

	test("unknown social host falls back to its name from the referrers list", () => {
		const rows: SocialReferrerRow[] = [
			row({ host: "quora.com", referrerUrl: "https://quora.com/q/1", sessions: 10 }),
		];
		const result = reshapeSocialReferrals(rows);
		expect(result[0].host).toBe("quora.com");
		expect(result[0].name).toBe("Quora");
	});
});

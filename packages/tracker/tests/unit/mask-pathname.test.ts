import { describe, expect, test } from "bun:test";
import { maskPathname } from "../../src/core/utils";

describe("maskPathname", () => {
	describe("no-op cases", () => {
		test("undefined patterns returns pathname unchanged", () => {
			expect(maskPathname("/users/123", undefined)).toBe("/users/123");
		});

		test("empty pattern list returns pathname unchanged", () => {
			expect(maskPathname("/users/123", [])).toBe("/users/123");
		});

		test("pattern without a star is skipped", () => {
			expect(maskPathname("/users/123", ["/users/123"])).toBe("/users/123");
		});

		test("non-matching pattern leaves path unchanged", () => {
			expect(maskPathname("/users/123", ["/admin/*"])).toBe("/users/123");
		});

		test("root path is never masked by segment patterns", () => {
			expect(maskPathname("/", ["/users/*", "/websites/*"])).toBe("/");
		});

		test("empty pathname is returned unchanged", () => {
			expect(maskPathname("", ["/users/*"])).toBe("");
		});

		test("non-string pattern entries are skipped without throwing", () => {
			const patterns = [null, 42, {}, "/users/*"] as unknown as string[];
			expect(maskPathname("/users/123", patterns)).toBe("/users/*");
		});

		test("pattern '/' alone is skipped", () => {
			expect(maskPathname("/users/123", ["/"])).toBe("/users/123");
		});

		test("empty string pattern is skipped", () => {
			expect(maskPathname("/users/123", [""])).toBe("/users/123");
		});
	});

	describe("single star", () => {
		test("masks one segment", () => {
			expect(maskPathname("/users/123", ["/users/*"])).toBe("/users/*");
		});

		test("passes trailing segments through", () => {
			expect(maskPathname("/users/123/settings", ["/users/*"])).toBe(
				"/users/*/settings"
			);
		});

		test("masks middle segment with literal suffix", () => {
			expect(maskPathname("/users/12345/profile", ["/users/*/profile"])).toBe(
				"/users/*/profile"
			);
		});

		test("literal segments after the star must match", () => {
			expect(maskPathname("/users/123/settings", ["/users/*/profile"])).toBe(
				"/users/123/settings"
			);
		});

		test("star requires a segment to exist", () => {
			expect(maskPathname("/users", ["/users/*"])).toBe("/users");
		});

		test("star matches an empty segment from a trailing slash", () => {
			expect(maskPathname("/users/", ["/users/*"])).toBe("/users/*");
		});

		test("'/*' masks only the first segment", () => {
			expect(maskPathname("/users/123", ["/*"])).toBe("/*/123");
		});

		test("patterns are root-anchored", () => {
			expect(maskPathname("/users/123", ["users/*"])).toBe("/users/123");
		});
	});

	describe("multiple stars", () => {
		test("masks two ID segments", () => {
			expect(
				maskPathname("/websites/tV1FRwicsiVkl3KbilZB5/users/cus_842", [
					"/websites/*/users/*",
				])
			).toBe("/websites/*/users/*");
		});

		test("passes segments after the last star through", () => {
			expect(
				maskPathname("/websites/abc/users/cus_1/sessions", [
					"/websites/*/users/*",
				])
			).toBe("/websites/*/users/*/sessions");
		});

		test("literal segment between stars must match", () => {
			expect(
				maskPathname("/websites/abc/settings/cus_1", ["/websites/*/users/*"])
			).toBe("/websites/abc/settings/cus_1");
		});

		test("three stars mask three segments", () => {
			expect(maskPathname("/a/1/b/2/c/3", ["/a/*/b/*/c/*"])).toBe(
				"/a/*/b/*/c/*"
			);
		});

		test("pattern longer than path does not match", () => {
			expect(maskPathname("/a/1", ["/a/*/b"])).toBe("/a/1");
		});
	});

	describe("globstar", () => {
		test("collapses everything after the prefix", () => {
			expect(
				maskPathname("/admin/users/12345/settings/security", ["/admin/**"])
			).toBe("/admin/*");
		});

		test("matches with zero remaining segments and leaves path unchanged", () => {
			expect(maskPathname("/admin", ["/admin/**"])).toBe("/admin");
		});

		test("does not treat a lone trailing slash as globstar content", () => {
			expect(maskPathname("/admin/", ["/admin/**"])).toBe("/admin");
		});

		test("combines with single stars", () => {
			expect(
				maskPathname("/websites/abc/users/cus_1/sessions/5", [
					"/websites/*/users/**",
				])
			).toBe("/websites/*/users/*");
		});

		test("'/**' collapses any path", () => {
			expect(maskPathname("/anything/here/at/all", ["/**"])).toBe("/*");
		});

		test("'/**' leaves root unchanged", () => {
			expect(maskPathname("/", ["/**"])).toBe("/");
		});

		test("segments after a mid-pattern globstar are ignored", () => {
			expect(maskPathname("/a/x/y/b", ["/a/**/b"])).toBe("/a/*");
		});
	});

	describe("partial-segment stars", () => {
		test("masks segments by prefix", () => {
			expect(
				maskPathname("/files/report-2024-Q1.pdf", ["/files/report-*"])
			).toBe("/files/report-*");
		});

		test("prefix mismatch does not match", () => {
			expect(
				maskPathname("/files/invoice-1.pdf", ["/files/report-*"])
			).toBe("/files/invoice-1.pdf");
		});

		test("masks segments by suffix", () => {
			expect(maskPathname("/files/q1-draft", ["/files/*-draft"])).toBe(
				"/files/*-draft"
			);
		});

		test("suffix mismatch does not match", () => {
			expect(maskPathname("/files/q1-final", ["/files/*-draft"])).toBe(
				"/files/q1-final"
			);
		});

		test("prefix and suffix must both match", () => {
			expect(maskPathname("/order-829/confirm", ["/order-*"])).toBe(
				"/order-*/confirm"
			);
			expect(maskPathname("/invoice-829/confirm", ["/order-*"])).toBe(
				"/invoice-829/confirm"
			);
		});

		test("prefix and suffix may not overlap the same characters", () => {
			expect(maskPathname("/files/ab", ["/files/abc*cba"])).toBe("/files/ab");
		});

		test("middle literals between stars are enforced", () => {
			expect(maskPathname("/files/a-x-c", ["/files/a*mid*c"])).toBe(
				"/files/a-x-c"
			);
			expect(maskPathname("/files/a-mid-c", ["/files/a*mid*c"])).toBe(
				"/files/a*mid*c"
			);
		});
	});

	describe("pattern ordering", () => {
		const ordered = ["/monitors/status-pages/*", "/monitors/*"];

		test("specific pattern listed first wins", () => {
			expect(maskPathname("/monitors/status-pages/sp_1", ordered)).toBe(
				"/monitors/status-pages/*"
			);
			expect(maskPathname("/monitors/mon_1", ordered)).toBe("/monitors/*");
		});

		test("general pattern listed first shadows the specific one", () => {
			expect(
				maskPathname("/monitors/status-pages/sp_1", [
					"/monitors/*",
					"/monitors/status-pages/*",
				])
			).toBe("/monitors/*/sp_1");
		});
	});

	describe("odd paths and patterns", () => {
		test("trailing slash on the path is preserved", () => {
			expect(maskPathname("/users/123/", ["/users/*"])).toBe("/users/*/");
		});

		test("trailing slash on the pattern is normalized away", () => {
			expect(maskPathname("/users/123", ["/users/*/"])).toBe("/users/*");
		});

		test("trailing slash after a globstar is normalized away", () => {
			expect(maskPathname("/admin/x/y", ["/admin/**/"])).toBe("/admin/*");
		});

		test("double slashes produce an empty segment the star can mask", () => {
			expect(maskPathname("/users//profile", ["/users/*"])).toBe(
				"/users/*/profile"
			);
		});

		test("matching is case-sensitive", () => {
			expect(maskPathname("/Users/123", ["/users/*"])).toBe("/Users/123");
		});

		test("masks percent-encoded segments", () => {
			expect(
				maskPathname("/users/%E4%BD%A0%E5%A5%BD", ["/users/*"])
			).toBe("/users/*");
		});

		test("masks raw unicode segments", () => {
			expect(maskPathname("/users/你好", ["/users/*"])).toBe("/users/*");
		});

		test("does not normalize dot segments", () => {
			expect(maskPathname("/files/../etc/passwd", ["/files/*"])).toBe(
				"/files/*/etc/passwd"
			);
		});

		test("a segment of only stars still masks", () => {
			expect(maskPathname("/users/123", ["/users/***"])).toBe("/users/***");
		});

		test("handles very deep paths without throwing", () => {
			const deep = `/websites/abc${"/x".repeat(5000)}`;
			expect(maskPathname(deep, ["/websites/*"])).toBe(
				`/websites/*${"/x".repeat(5000)}`
			);
		});
	});

	describe("invariants", () => {
		const patterns = [
			"/websites/*/users/*",
			"/websites/*/agent/*",
			"/websites/*",
			"/agent/*",
			"/invitations/*",
			"/links/*",
			"/monitors/status-pages/*",
			"/monitors/*",
			"/demo/*",
			"/public/*",
			"/dby/l/*",
		];

		test("masking is idempotent", () => {
			const paths = [
				"/websites/abc123",
				"/websites/abc123/users/cus_1",
				"/websites/abc123/settings/export",
				"/monitors/status-pages/sp_1",
				"/",
				"/settings",
			];
			for (const path of paths) {
				const once = maskPathname(path, patterns);
				expect(maskPathname(once, patterns)).toBe(once);
			}
		});

		test("masked output never contains the ID segment", () => {
			const routes = [
				(id: string) => `/websites/${id}`,
				(id: string) => `/websites/${id}/settings/export`,
				(id: string) => `/websites/site_x/users/${id}`,
				(id: string) => `/websites/site_x/agent/${id}`,
				(id: string) => `/agent/${id}`,
				(id: string) => `/invitations/${id}`,
				(id: string) => `/links/${id}`,
				(id: string) => `/monitors/${id}`,
				(id: string) => `/monitors/status-pages/${id}`,
				(id: string) => `/demo/${id}`,
				(id: string) => `/public/${id}`,
				(id: string) => `/dby/l/${id}`,
			];
			for (let i = 0; i < 50; i++) {
				const id = `id_${i.toString(36)}_${"x".repeat((i % 7) + 1)}${i}`;
				for (const route of routes) {
					expect(maskPathname(route(id), patterns)).not.toContain(id);
				}
			}
		});

		test("never throws on hostile inputs", () => {
			const hostile = [
				"",
				"/",
				"//",
				"///",
				"/users/123",
				`/${"a".repeat(10_000)}`,
				"/users/123?tab=1#hash",
				"/users/*",
				"*",
				"/../../etc",
			];
			const weirdPatterns = [
				"*",
				"**",
				"/*",
				"/**",
				"***",
				"*/",
				"/*/",
				"a**b",
				"/users/*",
				"/**/**",
				"/",
				"",
			];
			for (const path of hostile) {
				for (const pattern of weirdPatterns) {
					expect(() => maskPathname(path, [pattern])).not.toThrow();
				}
				expect(() => maskPathname(path, weirdPatterns)).not.toThrow();
			}
		});
	});

	describe("dashboard route coverage", () => {
		const patterns = [
			"/websites/*/users/*",
			"/websites/*/agent/*",
			"/websites/*",
			"/agent/*",
			"/invitations/*",
			"/links/*",
			"/monitors/status-pages/*",
			"/monitors/*",
			"/demo/*",
			"/public/*",
			"/dby/l/*",
		];

		const cases: Array<[string, string]> = [
			["/websites/tV1FRwicsiVkl3KbilZB5", "/websites/*"],
			[
				"/websites/tV1FRwicsiVkl3KbilZB5/settings/export",
				"/websites/*/settings/export",
			],
			["/websites/tV1FRwicsiVkl3KbilZB5/funnels", "/websites/*/funnels"],
			["/websites/site_1/users/cus_9f2", "/websites/*/users/*"],
			["/websites/site_1/agent/chat_123", "/websites/*/agent/*"],
			[
				"/websites/site_1/events/signup_completed",
				"/websites/*/events/signup_completed",
			],
			["/agent/chat_9", "/agent/*"],
			["/invitations/inv_1", "/invitations/*"],
			["/links/lnk_1", "/links/*"],
			["/monitors/status-pages/sp_1", "/monitors/status-pages/*"],
			["/monitors/mon_1", "/monitors/*"],
			["/demo/site_2/events/purchase", "/demo/*/events/purchase"],
			["/public/site_3", "/public/*"],
			["/dby/l/promo-x", "/dby/l/*"],
			["/websites", "/websites"],
			["/settings", "/settings"],
			["/", "/"],
			["/login", "/login"],
		];

		test.each(cases)("%s -> %s", (path, expected) => {
			expect(maskPathname(path, patterns)).toBe(expected);
		});
	});
});

describe("multi-wildcard segments", () => {
	test("middle fragments must match", () => {
		expect(maskPathname("/fooXbarYbaz", ["/foo*bar*baz"])).toBe("/foo*bar*baz");
		expect(maskPathname("/fooXYbaz", ["/foo*bar*baz"])).toBe("/fooXYbaz");
	});

	test("middle fragments must appear in order within the bounds", () => {
		expect(maskPathname("/barfoobaz", ["/foo*bar*baz"])).toBe("/barfoobaz");
	});
});

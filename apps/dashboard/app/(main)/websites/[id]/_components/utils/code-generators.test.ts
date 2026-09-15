import { describe, expect, it } from "bun:test";
import { publicConfig } from "@databuddy/env/public";
import {
	generateNodeCode,
	generateNpmCode,
	generateScriptTag,
	generateVueCode,
} from "./code-generators";
import { RECOMMENDED_DEFAULTS } from "./tracking-defaults";

describe("recommended tracking snippets", () => {
	it("sends each integration to the configured ingestion service", () => {
		const previous = publicConfig.urls.basket;
		try {
			for (const url of [
				"https://basket.databuddy.cc",
				"https://events.example.com",
			]) {
				publicConfig.urls.basket = url;
				expect(
					generateScriptTag("example-client-id", RECOMMENDED_DEFAULTS)
				).toContain(`data-api-url="${url}"`);
				expect(
					generateNpmCode("example-client-id", RECOMMENDED_DEFAULTS)
				).toContain(`apiUrl="${url}"`);
				expect(generateNodeCode("example-client-id")).toContain(
					`apiUrl: "${url}"`
				);
				expect(
					generateVueCode("example-client-id", RECOMMENDED_DEFAULTS)
				).toContain(`api-url="${url}"`);
			}
		} finally {
			publicConfig.urls.basket = previous;
		}
	});

	it("keeps zero-config page views and performance tracking enabled", () => {
		const script = generateScriptTag("example-client-id", RECOMMENDED_DEFAULTS);
		const npm = generateNpmCode("example-client-id", RECOMMENDED_DEFAULTS);

		expect(script).toContain('data-track-web-vitals="true"');
		expect(script).not.toContain("track-performance");
		expect(npm).toContain("trackWebVitals={true}");
		expect(npm).not.toContain("trackPerformance");
		expect(npm).not.toContain("trackScreenViews");
		expect(npm).not.toContain("trackSessions");
	});
});

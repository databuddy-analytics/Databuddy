import { describe, expect, it } from "bun:test";
import { generateNpmCode, generateScriptTag } from "./code-generators";
import { RECOMMENDED_DEFAULTS } from "./tracking-defaults";

describe("recommended tracking snippets", () => {
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

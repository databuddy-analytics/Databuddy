import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { competitors } from "./comparison-config";
import { homeFaqItems } from "./home-seo";

describe("public copy contracts", () => {
	it("does not recommend deprecated or nonexistent browser tracking options", async () => {
		const docsRoot = join(import.meta.dir, "..", "content", "docs");
		const glob = new Bun.Glob("**/*.mdx");
		const files: string[] = [];
		for await (const path of glob.scan({ cwd: docsRoot, onlyFiles: true })) {
			files.push(await readFile(join(docsRoot, path), "utf8"));
		}
		files.push(
			await readFile(join(import.meta.dir, "..", "app", "skill.md", "route.ts"), "utf8")
		);
		const publicDocs = files.join("\n");

		expect(publicDocs).not.toContain("data-track-performance");
		expect(publicDocs).not.toContain("data-track-screen-views");
		expect(publicDocs).not.toContain("trackSessions=");
	});

	it("lists every performance metric collected by trackWebVitals", async () => {
		const configuration = await readFile(
			join(
				import.meta.dir,
				"..",
				"content",
				"docs",
				"sdk",
				"configuration.mdx"
			),
			"utf8"
		);
		const vitalsPlugin = await readFile(
			join(
				import.meta.dir,
				"..",
				"..",
				"..",
				"packages",
				"tracker",
				"src",
				"plugins",
				"vitals.ts"
			),
			"utf8"
		);
		const description = "FCP, LCP, INP, CLS, TTFB, and FPS";

		expect(configuration.split(description)).toHaveLength(3);
		for (const metric of ["FCP", "LCP", "INP", "CLS", "TTFB", "FPS"]) {
			expect(vitalsPlugin).toContain(`on${metric}(handleMetric)`);
		}
	});

	it("keeps the tracker-size claim aligned with the checked-in bundle", async () => {
		const bundle = await readFile(
			join(
				import.meta.dir,
				"..",
				"..",
				"..",
				"packages",
				"tracker",
				"dist",
				"databuddy.js"
			)
		);
		const gzipKilobytes = Math.round(gzipSync(bundle).byteLength / 1024);
		const performanceAnswer = homeFaqItems.find(
			(item) => item.question === "Will the script slow down my site?"
		)?.answer;
		const comparisonCopy = JSON.stringify(competitors);

		expect(performanceAnswer).toContain(`${gzipKilobytes} KB`);
		expect(comparisonCopy).toContain(`${gzipKilobytes} KB gzip`);
		expect(comparisonCopy).not.toContain("3KB");
		expect(comparisonCopy).not.toContain("all features");
	});
});

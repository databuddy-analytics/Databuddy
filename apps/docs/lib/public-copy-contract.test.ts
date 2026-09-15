import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it, spyOn } from "bun:test";
import { plugin } from "bun";
import { createMdxPlugin } from "fumadocs-mdx/bun";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StructuredData } from "@/components/structured-data";
import { GET as robots } from "@/app/robots.txt/route";
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
			await readFile(
				join(import.meta.dir, "..", "app", "skill.md", "route.ts"),
				"utf8"
			)
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

describe("search discovery", () => {
	it("models missing attribution from the supplied assumptions", async () => {
		const { calculateCookieBannerCost } = await import(
			"@/app/(home)/calculator/_components/calculator-engine"
		);
		const inputs = {
			monthlyVisitors: 1000,
			visitorDataLossRate: 0.2,
			visitorToPaidRate: 0.05,
			revenuePerConversion: 9.99,
		};
		const result = calculateCookieBannerCost(inputs);
		expect(result.lostVisitors).toBe(200);
		expect(result.lostConversions).toBe(10);
		expect(result.lostRevenueYearly).toBeCloseTo(1198.8);
		expect(
			calculateCookieBannerCost({ ...inputs, visitorDataLossRate: 0 })
				.lostRevenueYearly
		).toBe(0);
	});
	it("normalizes calculator share values without losing decimal revenue", async () => {
		const { generateMetadata } = await import("@/app/(home)/calculator/page");
		const metadata = await generateMetadata({
			searchParams: Promise.resolve({
				revenue: "1e3",
				visitors: "0x10",
				cost: "9.99",
			}),
		});
		expect(metadata.description).toContain("$1,000");
		expect(metadata.description).not.toContain("Databuddy ~$9.99");
		expect(JSON.stringify(metadata.openGraph)).toContain(
			"revenue=1000&visitors=16"
		);
		const decimal = await generateMetadata({
			searchParams: Promise.resolve({ revenue: "9.99", visitors: "16" }),
		});
		expect(decimal.description).toContain("$9.99");
		const invalid = await generateMetadata({
			searchParams: Promise.resolve({
				revenue: "NaN",
				visitors: "1",
				cost: "1",
			}),
		});
		expect(JSON.stringify(invalid)).not.toContain("NaN");
	});

	it("allows rendering assets and pages whose noindex must be read", async () => {
		const body = await robots().text();
		expect(body).not.toContain("Disallow: /_next/");
		expect(body).not.toContain("Disallow: /contact/thanks");
		expect(body).toContain("Disallow: /api/");
	});

	it("uses supplied article authors and omits unknown documentation dates", () => {
		const markup = renderToStaticMarkup(
			createElement(StructuredData, {
				page: { url: "/docs", title: "Docs" },
				elements: [
					{ type: "documentation", value: { title: "Docs" } },
					{
						type: "article",
						value: {
							title: "Example",
							authors: [
								{ name: "Example Author", url: "https://example.com/author" },
							],
							datePublished: "2024-01-01",
						},
					},
				],
			})
		);
		const graph = JSON.parse(
			markup.slice(markup.indexOf(">") + 1, markup.lastIndexOf("</script>"))
		)["@graph"];
		const docs = graph.find((item: { "@type": string[] }) =>
			item["@type"].includes("TechArticle")
		);
		const article = graph.find((item: { "@type": string[] }) =>
			item["@type"].includes("BlogPosting")
		);
		expect(docs).not.toHaveProperty("datePublished");
		expect(docs).not.toHaveProperty("dateModified");
		expect(article.author).toEqual([
			{
				"@type": "Person",
				name: "Example Author",
				url: "https://example.com/author",
			},
		]);
		expect(markup).not.toContain("speakable");
	});

	it("keeps public pages discoverable through CMS failures and excludes machine endpoints", async () => {
		await plugin(createMdxPlugin());
		const { generateSitemapEntries } = await import("./sitemap-generator");
		const originalNodeEnv = process.env.NODE_ENV;
		const originalApiKey = process.env.MARBLE_API_KEY;
		const fetch = spyOn(globalThis, "fetch");
		try {
			process.env.NODE_ENV = "production";
			process.env.MARBLE_API_KEY = "test-token";
			fetch.mockResolvedValueOnce(Response.json(null, { status: 503 }));
			const fallback = await generateSitemapEntries();
			const urls = fallback.map((entry) => entry.url);
			for (const path of ["/blog", "/oss", "/branding", "/docs", "/pricing"]) {
				expect(urls).toContain(`https://www.databuddy.cc${path}`);
			}
			expect(new Set(urls).size).toBe(urls.length);
			expect(urls).toContain("https://www.databuddy.cc/compare");
			for (const { competitor } of Object.values(competitors)) {
				expect(urls).toContain(
					`https://www.databuddy.cc/compare/${competitor.slug}`
				);
				expect(urls).not.toContain(
					`https://www.databuddy.cc/alternatives/${competitor.slug}`
				);
				expect(urls).not.toContain(
					`https://www.databuddy.cc/switch-from/${competitor.slug}`
				);
			}
			for (const path of [
				"/ask",
				"/api/llms.txt",
				"/openapi.json",
				"/contact/thanks",
				"/alternatives",
				"/switch-from",
			]) {
				expect(urls).not.toContain(`https://www.databuddy.cc${path}`);
			}
			fetch.mockResolvedValueOnce(
				Response.json({
					posts: [
						{
							slug: "example",
							publishedAt: "2024-01-01",
							updatedAt: "2024-02-01",
						},
						{ slug: "draft", status: "draft", publishedAt: "2024-01-01" },
					],
				})
			);
			const entries = await generateSitemapEntries();
			expect(entries.filter((entry) => entry.url.includes("/blog/"))).toEqual([
				{
					url: "https://www.databuddy.cc/blog/example",
					lastModified: "2024-02-01T00:00:00.000Z",
				},
			]);
		} finally {
			fetch.mockRestore();
			if (originalNodeEnv === undefined)
				Reflect.deleteProperty(process.env, "NODE_ENV");
			else process.env.NODE_ENV = originalNodeEnv;
			if (originalApiKey === undefined)
				Reflect.deleteProperty(process.env, "MARBLE_API_KEY");
			else process.env.MARBLE_API_KEY = originalApiKey;
		}
	});
});

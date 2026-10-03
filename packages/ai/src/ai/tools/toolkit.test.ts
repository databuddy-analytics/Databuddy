import { describe, expect, test } from "bun:test";
import { createToolkit, type ToolIntegrations } from "./toolkit";

describe("connected agent tools", () => {
	test("drops unavailable integrations and keeps the full set when they are omitted", () => {
		const names = (integrations?: ToolIntegrations) =>
			Object.keys(
				createToolkit({
					capabilities: ["investigation"],
					integrations,
					organizationId: "org_1",
				})
			);
		const isIntegrationTool = (name: string) =>
			name.startsWith("github_") ||
			["scrape_page", "search_console", "search_website"].includes(name);
		const omitted = names();
		expect(omitted).toEqual(
			expect.arrayContaining([
				"github_commits",
				"github_repos",
				"scrape_page",
				"search_console",
				"search_website",
			])
		);
		expect(names({ github: true, scrape: true, searchConsole: true })).toEqual(
			omitted
		);
		expect(
			names({ github: false, scrape: false, searchConsole: false })
		).toEqual(omitted.filter((name) => !isIntegrationTool(name)));
	});
});

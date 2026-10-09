import { describe, expect, test } from "bun:test";
import { asSchema, type ToolSet } from "ai";
import { createConfig } from "../agents/analytics";
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

describe("dashboard write approvals", () => {
	test("every tool with a confirmed input waits for approval only when confirmed", async () => {
		const { tools } = createConfig({
			chatId: "chat_1",
			organizationId: "org_1",
			timezone: "UTC",
			userId: "user_1",
		});
		const options = { toolCallId: "call_1", messages: [] };
		const needsApproval = async (
			definition: ToolSet[string],
			confirmed: boolean
		) =>
			typeof definition.needsApproval === "function"
				? await definition.needsApproval({ confirmed }, options)
				: (definition.needsApproval ?? false);
		const decisions: Array<{
			confirmed: boolean;
			name: string;
			preview: boolean;
		}> = [];
		for (const [name, definition] of Object.entries(tools)) {
			const { properties } = await asSchema(definition.inputSchema).jsonSchema;
			if (properties && "confirmed" in properties) {
				decisions.push({
					name,
					confirmed: await needsApproval(definition, true),
					preview: await needsApproval(definition, false),
				});
			}
		}
		expect(decisions.map(({ name }) => name)).toEqual(
			expect.arrayContaining([
				"create_goal",
				"create_funnel",
				"update_flag",
				"delete_link",
				"delete_annotation",
				"configure_investigations",
			])
		);
		expect(decisions).toEqual(
			decisions.map(({ name }) => ({ name, confirmed: true, preview: false }))
		);
	});
});

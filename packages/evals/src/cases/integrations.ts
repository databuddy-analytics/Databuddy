import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

const ANALYTICS_TOOLS = [
	"get_data",
	"execute_query_builder",
	"execute_sql_query",
	"list_links",
	"list_link_folders",
	"create_link",
	"update_link",
	"delete_link",
	"list_funnels",
	"create_funnel",
	"list_goals",
	"create_goal",
	"list_annotations",
	"create_annotation",
	"list_flags",
	"create_flag",
	"update_flag",
	"add_users_to_flag",
];

/**
 * Integration-surface cases — behavior that must stay consistent between the
 * dashboard agent, MCP agent, and Slack adapter.
 */
export const integrationCases: EvalCase[] = [
	{
		id: "link-folders-list-before-assignment",
		category: "tool-routing",
		name: "Lists existing link folders before deciding where links belong",
		query:
			"What link folders do we have, how many links are in each, and how many links are unfiled?",
		websiteId: WS,
		surfaces: ["agent", "mcp", "slack"],
		tags: ["links", "folders", "workspace-context", "read-only"],
		expect: {
			toolsCalled: ["list_link_folders"],
			toolsNotCalled: ["create_link", "update_link", "delete_link"],
			maxSteps: 8,
			maxLatencyMs: 90_000,
		},
	},
	{
		id: "link-create-folder-slug-preview",
		category: "tool-routing",
		name: "Creates link preview using an existing folder slug, not folder name",
		query:
			'Create a short link named "Launch Waitlist" to https://www.databuddy.cc/waitlist with slug launch-waitlist in link folder slug growth. Show me the preview first.',
		websiteId: WS,
		surfaces: ["agent", "mcp", "slack"],
		tags: ["links", "folders", "mutation", "confirmation"],
		expect: {
			toolsCalled: ["create_link"],
			toolInputs: [
				{
					tool: "create_link",
					includes: {
						folderSlug: "growth",
						confirmed: false,
					},
					excludes: ["folderName"],
				},
			],
			confirmationFlow: true,
			maxSteps: 8,
			maxLatencyMs: 90_000,
		},
	},
	{
		id: "link-create-folder-id-preview",
		category: "tool-routing",
		name: "Creates link preview using folder id when the user provides one",
		query:
			'Create a short link named "Docs CTA" to https://www.databuddy.cc/docs with slug docs-cta in link folder id folder-growth. Preview only.',
		websiteId: WS,
		surfaces: ["agent", "mcp", "slack"],
		tags: ["links", "folders", "mutation", "confirmation"],
		expect: {
			toolsCalled: ["create_link"],
			toolInputs: [
				{
					tool: "create_link",
					includes: {
						folderId: "folder-growth",
						confirmed: false,
					},
					excludes: ["folderName", "folderSlug"],
				},
			],
			confirmationFlow: true,
			maxSteps: 8,
			maxLatencyMs: 90_000,
		},
	},
	{
		id: "mcp-website-discovery-no-default",
		category: "tool-routing",
		name: "MCP-style agent discovers available websites instead of requiring a default",
		query:
			"What websites do I have access to? List them and do not run analytics yet.",
		websiteId: WS,
		surfaces: ["mcp", "slack"],
		tags: ["website-discovery", "mcp", "slack", "no-default-website"],
		expect: {
			toolsCalled: ["list_websites"],
			toolsNotCalled: [
				"get_data",
				"execute_query_builder",
				"execute_sql_query",
			],
			maxSteps: 6,
			maxLatencyMs: 60_000,
		},
	},
	{
		id: "slack-thread-positive-followup-no-tools",
		category: "behavioral",
		name: "Slack positive follow-up is treated as feedback, not a new analytics task",
		query: "perfect, it works",
		websiteId: WS,
		surfaces: ["slack"],
		tags: ["slack", "feedback", "sentiment", "no-tools"],
		expect: {
			toolsNotCalled: ANALYTICS_TOOLS,
			responseNotContains: ["pageviews", "sessions", "unique visitors"],
			maxSteps: 1,
			maxLatencyMs: 15_000,
		},
	},
	{
		id: "slack-thread-negative-followup-no-tools",
		category: "behavioral",
		name: "Slack frustrated follow-up responds briefly without analytics tools",
		query: "nah that's still wrong",
		websiteId: WS,
		surfaces: ["slack"],
		tags: ["slack", "feedback", "sentiment", "no-tools"],
		expect: {
			toolsNotCalled: ANALYTICS_TOOLS,
			responseNotContains: ["pageviews", "sessions", "unique visitors"],
			maxSteps: 2,
			maxLatencyMs: 20_000,
		},
	},
];

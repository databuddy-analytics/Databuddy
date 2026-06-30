import { describe, expect, it } from "bun:test";
import { selectActiveToolsForQuestion } from "./run-agent";

describe("MCP agent active tool selection", () => {
	it("narrows clear Slack analytics requests to analytics tools", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "what changed in traffic over the last 7 days?",
				source: "slack",
			})
		).toEqual([
			"list_websites",
			"get_data",
			"execute_query_builder",
			"execute_sql_query",
			"list_profiles",
			"get_profile",
			"get_profile_sessions",
		]);
	});

	it("keeps Slack thread context available for thread references", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "which one should we fix first?",
				source: "slack",
			})
		).toEqual(["slack_read_current_thread"]);
	});

	it("does not hide mutation tools for non-analytics requests with generic timing words", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "can you create a feature flag now?",
				source: "slack",
			})
		).toBeUndefined();
		expect(
			selectActiveToolsForQuestion({
				question: "check funnel setup",
				source: "mcp",
			})
		).toBeUndefined();
	});

	it("keeps no-tool chat tool-free", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "lol ok",
				source: "slack",
			})
		).toEqual([]);
	});
});

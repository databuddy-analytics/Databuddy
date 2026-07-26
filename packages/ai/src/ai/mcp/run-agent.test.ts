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
			"investigations",
			"get_data",
			"execute_sql_query",
			"list_profiles",
			"get_profile",
			"get_profile_sessions",
			"list_profile_traits",
			"submit_feedback",
		]);
		expect(
			selectActiveToolsForQuestion({
				question: "what is the biggest thing I should fix today?",
				source: "slack",
			})
		).toContain("investigations");
		expect(
			selectActiveToolsForQuestion({
				question: "show me the latest insights",
				source: "slack",
			})
		).toContain("investigations");
	});

	it("does not let thread-reference words hijack explicit feedback requests", () => {
		expect(
			selectActiveToolsForQuestion({
				question:
					"can you send that to the databuddy team as a feature request?",
				source: "slack",
			})
		).toBeUndefined();
		expect(
			selectActiveToolsForQuestion({
				question: "this agent sucks, tell the team",
				source: "dashboard",
			})
		).toBeUndefined();
	});

	it("keeps all tools available when the user reports something broken", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "the errors page looks broken, can you report it?",
				source: "slack",
			})
		).toBeUndefined();
		expect(
			selectActiveToolsForQuestion({
				question: "i want to send feedback about the dashboard",
				source: "dashboard",
			})
		).toBeUndefined();
	});

	it("keeps Slack thread context available for thread references", () => {
		expect(
			selectActiveToolsForQuestion({
				question: "which one should we fix first?",
				source: "slack",
			})
		).toEqual(["slack_read_current_thread"]);
	});

	it("keeps every tool available for Slack confirmations and follow-ups", () => {
		for (const question of ["yes", "which one should we fix first?"]) {
			expect(
				selectActiveToolsForQuestion({
					hasPriorMessages: true,
					question,
					source: "slack",
				})
			).toBeUndefined();
		}
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

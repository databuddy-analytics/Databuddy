import { describe, expect, it } from "bun:test";
import { renderAgentOutputForSlack } from "@/slack/output-adapter";

describe("Slack output adapter", () => {
	it("renders dashboard data tables as Slack-safe markdown", () => {
		const raw = [
			"Here are the top pages:",
			JSON.stringify({
				type: "data-table",
				title: "Top Pages",
				columns: ["Page", "Visitors"],
				rows: [
					["/", 1500],
					["/pricing", 820],
				],
			}),
		].join("\n");

		const output = renderAgentOutputForSlack(raw);

		expect(output.convertedComponents).toBe(1);
		expect(output.markdown).toContain("*Top Pages*");
		expect(output.markdown).toContain("/pricing");
		expect(output.markdown).toContain("1,500");
		expect(output.markdown).not.toContain('"type"');
		expect(output.markdown).not.toContain("data-table");
	});

	it("strips fenced dashboard JSON wrappers", () => {
		const raw = [
			"Referrers:",
			"```json",
			JSON.stringify({
				type: "referrers-list",
				title: "Top Referrers",
				referrers: [{ name: "Google", domain: "google.com", visitors: 1234 }],
			}),
			"```",
		].join("\n");

		const output = renderAgentOutputForSlack(raw);

		expect(output.markdown).toContain("*Google*");
		expect(output.markdown).toContain("1,234 visitors");
		expect(output.markdown).not.toContain("```json");
		expect(output.markdown).not.toContain('"referrers"');
	});

	it("hides incomplete dashboard JSON while streaming", () => {
		const output = renderAgentOutputForSlack('Before {"type":"data-table"', {
			streaming: true,
		});

		expect(output.markdown).toBe("Before");
		expect(output.convertedComponents).toBe(0);
	});

	it("extracts chartable components instead of rendering tables", () => {
		const raw = [
			"Traffic trend:",
			JSON.stringify({
				type: "line-chart",
				title: "Sessions",
				series: ["Sessions"],
				rows: [
					["2026-07-01", 150],
					["2026-07-02", 141],
				],
			}),
		].join("\n");

		const output = renderAgentOutputForSlack(raw, { extractCharts: true });

		expect(output.charts).toHaveLength(1);
		expect(output.charts[0]?.type).toBe("line-chart");
		expect(output.convertedComponents).toBe(0);
		expect(output.markdown).toBe("Traffic trend:");
	});

	it("still renders chart tables when extraction is off", () => {
		const raw = JSON.stringify({
			type: "line-chart",
			title: "Sessions",
			series: ["Sessions"],
			rows: [["2026-07-01", 150]],
		});

		const output = renderAgentOutputForSlack(raw);

		expect(output.charts).toHaveLength(0);
		expect(output.convertedComponents).toBe(1);
		expect(output.markdown).toContain("*Sessions*");
	});
});

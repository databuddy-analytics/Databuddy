import { describe, expect, it } from "bun:test";
import { type ComponentSpec, splitAgentText } from "@databuddy/ai/agent/render";
import {
	type Block,
	componentsToBlocks,
	componentToBlocks,
} from "@/slack/blocks";
import { buildAnalyticsInstructionsForMcp } from "@databuddy/ai/prompts/analytics";

function firstBlock(spec: ComponentSpec): Block {
	const block = componentToBlocks(spec)[0];
	if (!block) {
		throw new Error("Expected a rendered block");
	}
	return block;
}

describe("componentToBlocks tables and lists", () => {
	it("maps a data-table numeric cell to raw_number with value and text", () => {
		const block = firstBlock({
			type: "data-table",
			title: "Top Pages",
			columns: ["Page", "Visitors"],
			rows: [["/", 1500]],
		});
		expect(block).toMatchObject({ type: "data_table", caption: "Top Pages" });
		if (block.type !== "data_table") {
			throw new Error("Expected a data table");
		}
		const rows = block.rows;
		expect(rows[1]).toEqual([
			{ type: "raw_text", text: "/" },
			{ type: "raw_number", value: 1500, text: "1,500" },
		]);
	});
});

describe("componentToBlocks charts", () => {
	it.each([
		"line",
		"area",
		"bar",
	])("renders %s charts without changing values or order", (type) => {
		const blocks = componentToBlocks({
			type: `${type}-chart`,
			title: "Daily Traffic",
			series: ["pageviews", "visitors"],
			rows: [
				["May 1", 1200, 480],
				["May 2", 0, -1.5],
			],
		});
		expect(blocks).toEqual([
			{
				type: "data_visualization",
				title: "Daily Traffic",
				chart: {
					type,
					axis_config: { categories: ["May 1", "May 2"] },
					series: [
						{
							name: "pageviews",
							data: [
								{ label: "May 1", value: 1200 },
								{ label: "May 2", value: 0 },
							],
						},
						{
							name: "visitors",
							data: [
								{ label: "May 1", value: 480 },
								{ label: "May 2", value: -1.5 },
							],
						},
					],
				},
			},
		]);
	});

	it.each([
		"pie-chart",
		"donut-chart",
	])("renders %s as a native pie with the complete denominator", (type) => {
		expect(
			firstBlock({
				type,
				title: "Devices",
				rows: [
					["Desktop", 3],
					["Mobile", 7],
				],
			})
		).toEqual({
			type: "data_visualization",
			title: "Devices",
			chart: {
				type: "pie",
				segments: [
					{ label: "Desktop", value: 3 },
					{ label: "Mobile", value: 7 },
				],
			},
		});
	});

	const chart = {
		type: "line-chart",
		title: "Trend",
		series: ["visitors"],
		rows: [["May 1", 42]],
	};
	it.each([
		{ type: "stacked-bar-chart" },
		{ title: "x".repeat(51) },
		{ series: ["x".repeat(21)] },
		{ series: ["same", "same"], rows: [["May 1", 1, 2]] },
		{ rows: [["x".repeat(21), 1]] },
		{
			rows: [
				["May 1", 1],
				["May 1", 2],
			],
		},
		{ rows: [["May 1", null]] },
		{ rows: [["May 1", "42"]] },
		{ rows: [["May 1", Number.NaN]] },
		{ rows: [["May 1", Number.POSITIVE_INFINITY]] },
		{ rows: [["May 1"]] },
		{ rows: [["May 1", 1, 2]] },
		{
			type: "pie-chart",
			rows: [
				["Desktop", 3],
				["Mobile", 0],
			],
		},
		{
			type: "pie-chart",
			rows: [
				["Desktop", 3],
				["Mobile", -1],
			],
		},
		{ rows: Array.from({ length: 21 }, (_, i) => [`Day ${i}`, i]) },
		{
			type: "pie-chart",
			rows: Array.from({ length: 13 }, (_, i) => [`Item ${i}`, i + 1]),
		},
		{
			series: Array.from({ length: 13 }, (_, i) => `Metric ${i}`),
			rows: [["Day", ...Array.from({ length: 13 }, () => 1)]],
		},
	])("keeps a table when Slack cannot faithfully chart %j", (override) => {
		expect(firstBlock({ ...chart, ...override }).type).toBe("data_table");
	});

	it("accepts chart limits and falls back only after two native charts per message", () => {
		const boundary = {
			type: "area-chart",
			title: "x".repeat(50),
			series: Array.from({ length: 12 }, (_, i) => `${i}`.padEnd(20, "x")),
			rows: Array.from({ length: 20 }, (_, i) => [
				`${i}`.padEnd(20, "x"),
				...Array.from({ length: 12 }, () => i),
			]),
		};
		const blocks = componentsToBlocks([
			{ ...chart, type: "stacked-bar-chart" },
			boundary,
			chart,
			chart,
		]);
		expect(blocks.map((block) => block.type)).toEqual([
			"data_table",
			"data_visualization",
			"data_visualization",
			"data_table",
		]);
		expect(blocks[3]).toEqual(componentToBlocks(chart, false)[0]);
		expect(componentsToBlocks([chart], false)[0]?.type).toBe("data_table");
	});

	it("preserves values in table fallbacks and labels row limits", () => {
		const rows = Array.from({ length: 100 }, (_, i) => [`Day ${i}`, i]);
		const block = firstBlock({ ...chart, rows });
		expect(block).toMatchObject({
			type: "data_table",
			caption: "Trend (showing 99 of 100 rows)",
		});
		expect(firstBlock({ ...chart, rows: [null] }).type).toBe("context");
		expect(firstBlock({ ...chart, rows: [["Day", "42"]] })).toMatchObject({
			rows: [
				[{ text: "Period" }, { text: "visitors" }],
				[{ text: "Day" }, { type: "raw_text", text: "42" }],
			],
		});
	});
});

describe("componentToBlocks native actions and previews", () => {
	it("renders dashboard-actions as link buttons only for dashboard urls", () => {
		const block = firstBlock({
			type: "dashboard-actions",
			actions: [
				{ label: "Open errors", href: "/websites/abc/errors" },
				{ label: "External", href: "https://example.com" },
				{
					label: "Open goals",
					href: "https://app.databuddy.cc/websites/abc/goals",
				},
				{ label: "Protocol relative", href: "//example.com/websites" },
				{ label: "Userinfo", href: "https://app.databuddy.cc@example.com/" },
				{ label: "Lookalike", href: "https://app.databuddy.cc.example.com/" },
				{ label: "No href" },
			],
		});
		expect(block.type).toBe("actions");
		if (block.type !== "actions") {
			throw new Error("Expected an actions block");
		}
		expect(block.elements).toEqual([
			{
				type: "button",
				text: { type: "plain_text", text: "Open errors" },
				url: "https://app.databuddy.cc/websites/abc/errors",
			},
			{
				type: "button",
				text: { type: "plain_text", text: "Open goals" },
				url: "https://app.databuddy.cc/websites/abc/goals",
			},
		]);
	});

	it("renders suggested-actions as drill-down buttons carrying the prompt", () => {
		const block = firstBlock({
			type: "suggested-actions",
			actions: [
				{
					label: "Break down by referrer",
					prompt: "break /pricing down by referrer",
				},
				{ label: "No prompt" },
				{ label: "Compare yesterday", prompt: "compare with yesterday" },
			],
		});
		expect(block.type).toBe("actions");
		if (block.type !== "actions") {
			throw new Error("Expected an actions block");
		}
		const elements = block.elements.filter(
			(element) => element.type === "button"
		);
		expect(block.elements).toHaveLength(2);
		expect(elements.map((element) => element.action_id)).toEqual([
			"agent_drilldown_0",
			"agent_drilldown_2",
		]);
		expect(elements[0]?.value).toBe("break /pricing down by referrer");
		expect(elements[1]?.value).toBe("compare with yesterday");
	});
});

describe("componentToBlocks no silent drop", () => {
	it("falls back to a context note when a renderer produces nothing", () => {
		const blocks = componentToBlocks({
			type: "referrers-list",
			referrers: [],
			title: "Top referrers",
		});
		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.type).toBe("context");
	});

	it("never returns an empty block list for a known component", () => {
		const blocks = componentsToBlocks([
			{ type: "data-table", columns: [], rows: [] },
			{ type: "mini-map", countries: [] },
		]);
		expect(blocks.length).toBe(2);
		expect(blocks.every((b) => typeof b.type === "string")).toBe(true);
	});
});

describe("Slack agent prompt components", () => {
	it("renders every component example the Slack agent is given as native blocks", () => {
		const { components, text } = splitAgentText(
			buildAnalyticsInstructionsForMcp({
				currentDateTime: "2026-10-03T12:00:00.000Z",
				mutationMode: "dry-run",
				source: "slack",
			})
		);
		const rendered = components.map((component) => [
			component.type,
			componentToBlocks(component)[0]?.type,
		]);

		expect(text).not.toContain('{"type":"');
		expect(rendered).toContainEqual(["data-table", "data_table"]);
		expect(rendered.map(([, block]) => block)).not.toContain("context");
	});
});

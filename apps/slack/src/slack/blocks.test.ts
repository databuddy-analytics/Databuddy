import { describe, expect, it } from "bun:test";
import {
	type Block,
	ComponentStreamSplitter,
	type ComponentSpec,
	componentsToBlocks,
	componentToBlocks,
	splitAgentText,
} from "@/slack/blocks";

const DATA_TABLE = `{"type":"data-table","title":"Top Pages","columns":["Page","Visitors"],"rows":[["/",1500],["/pricing",820]]}`;

function pushAll(chunks: string[]): { components: unknown[]; text: string } {
	const splitter = new ComponentStreamSplitter();
	let text = "";
	for (const chunk of chunks) {
		text += splitter.push(chunk);
	}
	const tail = splitter.flush();
	return { components: tail.components, text: text + tail.text };
}

function firstBlock(spec: ComponentSpec): Block {
	const blocks = componentToBlocks(spec);
	expect(blocks.length).toBeGreaterThan(0);
	return blocks[0];
}

describe("ComponentStreamSplitter", () => {
	it("diverts a data-table component out of the prose text", () => {
		const input = `Here are your top pages.\n${DATA_TABLE}\nLet me know if you need more.`;
		const { text, components } = splitAgentText(input);

		expect(text).not.toContain('{"type"');
		expect(text).toContain("Here are your top pages.");
		expect(text).toContain("Let me know if you need more.");
		expect(components).toHaveLength(1);
	});

	it("reassembles a component split across multiple chunks", () => {
		const mid = Math.floor(DATA_TABLE.length / 2);
		const { text, components } = pushAll([
			"prose ",
			DATA_TABLE.slice(0, mid),
			DATA_TABLE.slice(mid),
			" tail",
		]);

		expect(components).toHaveLength(1);
		expect(text).toBe("prose  tail");
	});

	it("holds back a partial component marker instead of leaking it mid-stream", () => {
		const splitter = new ComponentStreamSplitter();
		const emitted = splitter.push('done. {"ty');
		expect(emitted).toBe("done. ");
	});

	it("does not divert ordinary JSON-looking prose without a known type", () => {
		const input = 'The config was {"port": 3010} yesterday.';
		const { text, components } = splitAgentText(input);
		expect(components).toHaveLength(0);
		expect(text).toContain('{"port": 3010}');
	});
});

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
		expect(componentsToBlocks([chart], false)[0].type).toBe("data_table");
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
	it("renders dashboard-actions as link buttons with absolute urls", () => {
		const block = firstBlock({
			type: "dashboard-actions",
			actions: [
				{ label: "Open errors", href: "/websites/abc/errors" },
				{ label: "External", href: "https://example.com" },
				{ label: "No href" },
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
		expect(elements[0].url).toBe(
			"https://app.databuddy.cc/websites/abc/errors"
		);
		expect(elements[1].url).toBe("https://example.com");
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
		expect(elements[0].value).toBe("break /pricing down by referrer");
		expect(elements[1].value).toBe("compare with yesterday");
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
		expect(blocks[0].type).toBe("context");
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

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

describe("componentToBlocks — tables and lists", () => {
	it("maps a data-table numeric cell to raw_number with value and text", () => {
		const block = firstBlock({
			type: "data-table",
			title: "Top Pages",
			columns: ["Page", "Visitors"],
			rows: [["/", 1500]],
		});
		expect(block).toMatchObject({ type: "data_table", caption: "Top Pages" });
		const rows = block.rows as unknown[][];
		expect(rows[1]).toEqual([
			{ type: "raw_text", text: "/" },
			{ type: "raw_number", value: 1500, text: "1,500" },
		]);
	});

});

describe("componentToBlocks — charts are no longer dropped", () => {
	it("renders a time-series chart as a data_table instead of vanishing", () => {
		const blocks = componentToBlocks({
			type: "area-chart",
			title: "Daily Traffic",
			series: ["pageviews", "visitors"],
			rows: [
				["May 1", 1200, 480],
				["May 2", 1350, 520],
			],
		});
		expect(blocks[0]).toMatchObject({ type: "data_table", caption: "Daily Traffic" });
		const header = (blocks[0].rows as unknown[][])[0].map((c) => (c as { text: string }).text);
		expect(header).toEqual(["Period", "pageviews", "visitors"]);
	});

});

describe("componentToBlocks — native actions and previews", () => {
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
		const elements = block.elements as Array<{ url: string }>;
		expect(elements).toHaveLength(2);
		expect(elements[0].url).toBe("https://app.databuddy.cc/websites/abc/errors");
		expect(elements[1].url).toBe("https://example.com");
	});

	it("renders suggested-actions as drill-down buttons carrying the prompt", () => {
		const block = firstBlock({
			type: "suggested-actions",
			actions: [
				{ label: "Break down by referrer", prompt: "break /pricing down by referrer" },
				{ label: "No prompt" },
			],
		});
		expect(block.type).toBe("actions");
		const elements = block.elements as Array<Record<string, unknown>>;
		expect(elements).toHaveLength(1);
		expect(elements[0].action_id).toBe("agent_drilldown");
		expect(elements[0].value).toBe("break /pricing down by referrer");
	});

});

describe("componentToBlocks — no silent drop", () => {
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

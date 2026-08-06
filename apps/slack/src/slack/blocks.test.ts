import { describe, expect, it } from "bun:test";
import {
	type Block,
	ComponentStreamSplitter,
	type ComponentSpec,
	componentsToBlocks,
	componentToBlocks,
	FEEDBACK_ACTION_ID,
	feedbackButtonsBlock,
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

	it("renders a referrers-list as a data_table with a share column", () => {
		const block = firstBlock({
			type: "referrers-list",
			referrers: [{ name: "Google", domain: "google.com", visitors: 500, percentage: 45.5 }],
		});
		expect(block).toMatchObject({ type: "data_table" });
		const rows = block.rows as unknown[][];
		expect(rows[0].map((c) => (c as { text: string }).text)).toEqual([
			"Referrer",
			"Visitors",
			"Share",
		]);
		expect(rows[1][2]).toEqual({ type: "raw_text", text: "45.5%" });
	});

	it("renders a goals-list with a status column", () => {
		const block = firstBlock({
			type: "goals-list",
			goals: [{ id: "1", name: "Signup", type: "EVENT", target: "signup", isActive: false }],
		});
		const rows = block.rows as unknown[][];
		expect(rows[1][3]).toEqual({ type: "raw_text", text: "Paused" });
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

	it("renders a donut chart as a Segment/Value data_table", () => {
		const block = firstBlock({
			type: "donut-chart",
			title: "Devices",
			rows: [["Desktop", 650], ["Mobile", 280]],
		});
		const header = (block.rows as unknown[][])[0].map((c) => (c as { text: string }).text);
		expect(header).toEqual(["Segment", "Value"]);
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

	it("renders a feedback-preview as a section card", () => {
		const blocks = componentToBlocks({
			type: "feedback-preview",
			mode: "sent",
			feedback: { title: "Dark mode", category: "feature_request", description: "Please add it" },
		});
		expect(blocks[0].type).toBe("section");
		const text = (blocks[0].text as { text: string }).text;
		expect(text).toContain("Dark mode");
		expect(text).toContain("Please add it");
	});
});

describe("feedbackButtonsBlock", () => {
	it("builds a context_actions block with thumbsup/thumbsdown signals", () => {
		const block = feedbackButtonsBlock();
		expect(block.type).toBe("context_actions");
		const element = (block.elements as Array<Record<string, unknown>>)[0];
		expect(element.type).toBe("feedback_buttons");
		expect(element.action_id).toBe(FEEDBACK_ACTION_ID);
		expect((element.positive_button as { value: string }).value).toBe("thumbsup");
		expect((element.negative_button as { value: string }).value).toBe(
			"thumbsdown"
		);
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

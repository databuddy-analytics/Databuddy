import { describe, expect, it } from "bun:test";
import {
	ComponentStreamSplitter,
	componentToPlainText,
	splitAgentText,
} from "./render";

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

describe("markdown output", () => {
	it("renders a streamed data-table in place as a markdown table", () => {
		const splitter = new ComponentStreamSplitter(componentToPlainText);
		const mid = Math.floor(DATA_TABLE.length / 2);
		const text =
			splitter.push(`Top pages:\n${DATA_TABLE.slice(0, mid)}`) +
			splitter.push(`${DATA_TABLE.slice(mid)}\nDone.`) +
			splitter.flush().text;

		expect(text).toBe(
			"Top pages:\n**Top Pages**\n| Page | Visitors |\n| --- | --- |\n| / | 1,500 |\n| /pricing | 820 |\nDone."
		);
	});

	it("renders charts as lists and drops components with nothing to read", () => {
		const { text } = splitAgentText(
			'{"type":"line-chart","title":"Daily","series":["visitors","sessions"],"rows":[["May 1",10,12],["May 2",11,14]]}\n{"type":"suggested-actions","actions":[{"label":"More","prompt":"more"}]}',
			componentToPlainText
		);

		expect(text).toBe(
			"**Daily**\n- May 1: visitors 10, sessions 12\n- May 2: visitors 11, sessions 14\n"
		);
	});
});

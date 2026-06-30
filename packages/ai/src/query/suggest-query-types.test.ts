import { describe, expect, it } from "vitest";
import { suggestQueryTypes } from "./index";

describe("suggestQueryTypes", () => {
	it("suggests page builders for a hallucinated pages_ranked type", () => {
		const suggestions = suggestQueryTypes("pages_ranked");
		expect(suggestions).toContain("top_pages");
		expect(suggestions).toContain("entry_pages");
		expect(suggestions).toContain("exit_pages");
	});

	it("still prefers prefix and substring matches", () => {
		expect(suggestQueryTypes("top_pages")).toContain("top_pages");
		expect(suggestQueryTypes("revenue")[0]).toMatch(/^revenue/);
	});

	it("returns nothing for input that shares no token", () => {
		expect(suggestQueryTypes("zzzzz")).toEqual([]);
	});
});

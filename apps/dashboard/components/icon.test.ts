import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { FEATURED_AI_PRODUCTS } from "@databuddy/shared/bot-detection/types";
import { AI_ICON_COLORS, aiProductColor } from "./icon";

describe("AI product logos", () => {
	it("has exactly one SVG in public/ai for every logo entry", () => {
		const files = readdirSync(join(import.meta.dir, "../public/ai"))
			.filter((file) => file.endsWith(".svg"))
			.map((file) => file.replace(".svg", ""));
		expect(files.sort()).toEqual(Object.keys(AI_ICON_COLORS).sort());
	});

	it("resolves a logo for every featured AI product", () => {
		expect(
			FEATURED_AI_PRODUCTS.filter((product) => !aiProductColor(product))
		).toEqual([]);
	});
});

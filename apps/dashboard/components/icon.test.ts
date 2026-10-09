import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	AI_ICON_COLORS,
	FEATURED_AI_PRODUCTS,
} from "@databuddy/shared/bot-detection/types";
import { aiProductColor } from "./icon";

describe("AI product logos", () => {
	it.each([
		["public/ai", ".svg"],
		["public/ai/email", ".png"],
	])("has exactly one logo in %s for every logo entry", (folder, extension) => {
		const files = readdirSync(join(import.meta.dir, "..", folder))
			.filter((file) => file.endsWith(extension))
			.map((file) => file.replace(extension, ""));
		expect(files.sort()).toEqual(Object.keys(AI_ICON_COLORS).sort());
	});

	it("resolves a logo for every featured AI product", () => {
		expect(
			FEATURED_AI_PRODUCTS.filter((product) => !aiProductColor(product))
		).toEqual([]);
	});
});

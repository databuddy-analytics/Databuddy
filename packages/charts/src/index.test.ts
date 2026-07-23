import { describe, expect, it } from "bun:test";
import {
	CHARTABLE_COMPONENT_TYPES,
	isChartableComponent,
	renderChartPng,
} from "./index";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const timeSeriesPayload = {
	title: "Traffic overview",
	series: ["Sessions", "Visitors"],
	rows: [
		["2026-06-01", 147, 127],
		["2026-06-02", 78, 70],
		["2026-06-03", 186, 169],
		["2026-06-04", 154, 144],
	],
};

const distributionPayload = {
	title: "Top browsers",
	rows: [
		["Chrome", 1240],
		["Safari", 620],
		["Firefox", 210],
		["Edge", 90],
	],
};

describe("isChartableComponent", () => {
	it("accepts every chartable type", () => {
		for (const type of CHARTABLE_COMPONENT_TYPES) {
			expect(isChartableComponent(type)).toBe(true);
		}
	});

	it("rejects non-chart components", () => {
		expect(isChartableComponent("data-table")).toBe(false);
		expect(isChartableComponent("referrers-list")).toBe(false);
	});
});

describe("renderChartPng", () => {
	for (const type of [
		"line-chart",
		"area-chart",
		"bar-chart",
		"stacked-bar-chart",
	]) {
		it(`renders a ${type} PNG`, () => {
			const png = renderChartPng({ ...timeSeriesPayload, type });
			expect(png).not.toBeNull();
			expect(png?.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
			expect(png!.length).toBeGreaterThan(10_000);
		});
	}

	for (const type of ["pie-chart", "donut-chart"]) {
		it(`renders a ${type} PNG`, () => {
			const png = renderChartPng({ ...distributionPayload, type });
			expect(png).not.toBeNull();
			expect(png?.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
			expect(png!.length).toBeGreaterThan(10_000);
		});
	}

	it("renders the light theme", () => {
		const png = renderChartPng(
			{ ...timeSeriesPayload, type: "area-chart" },
			{ theme: "light", subtitle: "databuddy.cc · last 4 days" }
		);
		expect(png?.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true);
	});

	it("returns null for unsupported types", () => {
		expect(renderChartPng({ type: "data-table", rows: [] })).toBeNull();
	});

	it("returns null for empty data", () => {
		expect(
			renderChartPng({ type: "line-chart", series: [], rows: [] })
		).toBeNull();
		expect(renderChartPng({ type: "pie-chart", rows: [] })).toBeNull();
	});
});

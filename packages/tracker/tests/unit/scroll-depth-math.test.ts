import { describe, expect, test } from "bun:test";
import {
	scrollableRangePx,
	scrollDepthPercentFromScrollY,
	updateMaxScrollDepth,
} from "../../src/plugins/scroll-depth-math";

describe("scroll-depth-math", () => {
	test("scrollableRangePx", () => {
		expect(scrollableRangePx(3000, 800)).toBe(2200);
		expect(scrollableRangePx(800, 800)).toBe(0);
		expect(scrollableRangePx(600, 800)).toBe(-200);
		expect(scrollableRangePx(Number.NaN, 800)).toBe(-800);
		expect(scrollableRangePx(1000, Number.NaN)).toBe(1000);
	});

	test("scrollDepthPercentFromScrollY", () => {
		expect(scrollDepthPercentFromScrollY(0, 0)).toBe(100);
		expect(scrollDepthPercentFromScrollY(0, -10)).toBe(100);
		expect(scrollDepthPercentFromScrollY(0, 2000)).toBe(0);
		expect(scrollDepthPercentFromScrollY(2000, 2000)).toBe(100);
		expect(scrollDepthPercentFromScrollY(500, 2000)).toBe(25);
		expect(scrollDepthPercentFromScrollY(333, 1000)).toBe(33);
		expect(scrollDepthPercentFromScrollY(335, 1000)).toBe(34);
		expect(scrollDepthPercentFromScrollY(5000, 2000)).toBe(100);
		expect(scrollDepthPercentFromScrollY(-100, 2000)).toBe(0);
		expect(scrollDepthPercentFromScrollY(Number.NaN, 2000)).toBe(0);
		expect(scrollDepthPercentFromScrollY(Number.POSITIVE_INFINITY, 2000)).toBe(
			0
		);
	});

	test("updateMaxScrollDepth", () => {
		let max = updateMaxScrollDepth(0, 100, 3000, 800);
		expect(max).toBeGreaterThan(0);
		const peak = max;
		max = updateMaxScrollDepth(max, 0, 3000, 800);
		expect(max).toBe(peak);

		max = updateMaxScrollDepth(0, 0, 600, 800);
		expect(max).toBe(100);
		expect(updateMaxScrollDepth(max, 0, 600, 800)).toBe(100);

		expect(updateMaxScrollDepth(0, 1000, 2800, 800)).toBe(50);
	});
});

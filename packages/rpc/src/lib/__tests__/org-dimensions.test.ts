import { describe, expect, test } from "bun:test";
import {
	mergeDimensionRows,
	type DimensionRow,
} from "../org-dimensions";

describe("mergeDimensionRows", () => {
	test("sums values across websites by key and sorts desc by current", () => {
		const rows: DimensionRow[] = [
			{ key: "US", label: "United States", current: 100, previous: 80 },
			{ key: "US", label: "United States", current: 50,  previous: 30 },
			{ key: "DE", label: "Germany",        current: 200, previous: 100 },
		];
		const result = mergeDimensionRows(rows, 10);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			key: "DE",
			label: "Germany",
			current: 200,
			previous: 100,
			change: 100,
		});
		expect(result[1].key).toBe("US");
		expect(result[1].current).toBe(150);
		expect(result[1].previous).toBe(110);
	});

	test("honors limit", () => {
		const rows: DimensionRow[] = Array.from({ length: 20 }, (_, i) => ({
			key: `k${i}`,
			label: `k${i}`,
			current: i,
			previous: i - 1,
		}));
		expect(mergeDimensionRows(rows, 5)).toHaveLength(5);
	});

	test("change is signed percent, 0 when previous is 0", () => {
		const rows: DimensionRow[] = [
			{ key: "A", label: "A", current: 200, previous: 100 },
			{ key: "B", label: "B", current: 50,  previous: 0   },
		];
		const result = mergeDimensionRows(rows, 10);
		const a = result.find((r) => r.key === "A")!;
		const b = result.find((r) => r.key === "B")!;
		expect(a.change).toBeCloseTo(100, 0);
		expect(b.change).toBe(0);
	});

	test("empty input returns empty array", () => {
		expect(mergeDimensionRows([], 10)).toEqual([]);
	});

	test("label from first occurrence is kept when keys merge", () => {
		const rows: DimensionRow[] = [
			{ key: "X", label: "Xylophone", current: 10, previous: 5 },
			{ key: "X", label: "Xanadu",    current: 20, previous: 15 },
		];
		const result = mergeDimensionRows(rows, 10);
		expect(result[0].label).toBe("Xylophone");
	});
});

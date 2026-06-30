import { bench, describe } from "vitest";
import {
	buildUnionQuery,
	getCompatibleQueries,
	getSchemaGroups,
} from "./batch-executor";
import type { QueryRequest } from "./types";

const BASE: QueryRequest = {
	projectId: "bench-website",
	type: "country",
	from: "2026-04-01",
	to: "2026-04-30",
};

function req(type: string): QueryRequest & { type: string } {
	return { ...BASE, type };
}

describe("batch-executor schema discovery", () => {
	bench("getSchemaGroups (cold cache)", () => {
		getSchemaGroups();
	});

	bench("getCompatibleQueries('country')", () => {
		getCompatibleQueries("country");
	});
});

describe("batch-executor union compile", () => {
	const standardDimensionGroup = [
		"top_pages",
		"utm_sources",
		"utm_campaigns",
		"browser_name",
		"os_name",
		"country",
	].map((type, index) => ({ index, req: req(type) }));

	const revenueDimensionGroup = [
		"revenue_by_provider",
		"revenue_by_country",
		"revenue_by_browser",
		"revenue_by_device",
		"revenue_by_os",
	].map((type, index) => ({ index, req: req(type) }));

	const performanceGroup = [
		"slow_pages",
		"performance_by_browser",
		"performance_by_country",
		"performance_by_os",
		"performance_by_region",
	].map((type, index) => ({ index, req: req(type) }));

	bench("union 6 standard-dimension builders", () => {
		buildUnionQuery(standardDimensionGroup);
	});

	bench("union 5 revenue-dimension builders", () => {
		buildUnionQuery(revenueDimensionGroup);
	});

	bench("union 5 performance-dimension builders", () => {
		buildUnionQuery(performanceGroup);
	});
});

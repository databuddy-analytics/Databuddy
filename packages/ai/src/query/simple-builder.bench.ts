import { bench, describe } from "vitest";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { QueryRequest } from "./types";

const BASE_REQUEST: QueryRequest = {
	projectId: "bench-website",
	type: "country",
	from: "2026-04-01",
	to: "2026-04-30",
};

const BENCH_BUILDERS = [
	"country",
	"top_pages",
	"top_referrers",
	"vitals_by_country",
	"revenue_by_country",
	"interesting_sessions",
];

describe("SimpleQueryBuilder.compile (cold per-request)", () => {
	for (const type of BENCH_BUILDERS) {
		const config = QueryBuilders[type];
		if (!config) {
			continue;
		}
		bench(`compile ${type}`, () => {
			new SimpleQueryBuilder(config, { ...BASE_REQUEST, type }).compile();
		});
	}
});

describe("SimpleQueryBuilder.compile with filters", () => {
	const filterRequest: QueryRequest = {
		...BASE_REQUEST,
		filters: [
			{ field: "country", op: "in", value: ["US", "GB", "DE", "FR", "JP"] },
			{ field: "device_type", op: "eq", value: "mobile" },
			{ field: "path", op: "contains", value: "/checkout" },
		],
	};

	for (const type of ["country", "top_pages", "vitals_by_country"]) {
		const config = QueryBuilders[type];
		if (!config) {
			continue;
		}
		bench(`compile ${type} (3 filters)`, () => {
			new SimpleQueryBuilder(config, { ...filterRequest, type }).compile();
		});
	}
});

describe("SimpleQueryBuilder.compile org-scope", () => {
	const orgRequest: QueryRequest = {
		...BASE_REQUEST,
		organizationWebsiteIds: ["w1", "w2", "w3", "w4", "w5"],
	};

	for (const type of ["country", "top_pages", "revenue_by_country"]) {
		const config = QueryBuilders[type];
		if (!config) {
			continue;
		}
		bench(`compile ${type} (org scope)`, () => {
			new SimpleQueryBuilder(config, { ...orgRequest, type }).compile();
		});
	}
});

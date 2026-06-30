import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import { parseReferrer } from "@databuddy/shared/utils/referrer";
import type { SimpleQueryConfig } from "./types";

interface DataRow {
	clicks?: number;
	country_code?: string;
	country_name?: string;
	customers?: number;
	domain?: string;
	name?: string;
	pageviews?: number;
	percentage?: number;
	referrer?: string;
	revenue?: number;
	source?: string;
	transactions?: number;
	visitors?: number;
	[key: string]: unknown;
}

const toNumber = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const DIRECT_SOURCE = "direct";

function shouldParseReferrers(config: SimpleQueryConfig): boolean {
	return config.plugins?.parseReferrers === true;
}

export function applyPlugins(
	data: DataRow[],
	config: SimpleQueryConfig,
	websiteDomain?: string | null
): DataRow[] {
	let result = data;

	if (shouldParseReferrers(config)) {
		result = result.map((row) => {
			const url = getReferrerInput(row);
			if (!url) {
				return row;
			}
			const parsed = parseReferrer(url, websiteDomain);
			const source = canonicalReferrerSource(parsed.type, parsed.url || url);
			return {
				...row,
				name: parsed.name,
				referrer: source,
				source,
				domain: parsed.domain,
				referrer_type: parsed.type,
			};
		});
	}

	if (config.plugins?.deduplicateReferrers) {
		const aggregate = getReferrerAggregateOptions(result);
		result = aggregateRows(result, {
			getKey: (row) => {
				const type = str(row.referrer_type).toLowerCase();
				if (type === "direct") {
					return "direct";
				}
				return (
					str(row.name).toLowerCase() ||
					str(row.domain).toLowerCase() ||
					str(row.referrer).toLowerCase() ||
					str(row.source).toLowerCase()
				);
			},
			getName: (row, key) => str(row.name) || key,
			sumFields: aggregate.sumFields,
			sortBy: aggregate.sortBy,
		});
	}

	if (config.plugins?.normalizeUrls) {
		result = result.map((row) => {
			const original = str(row.name);
			if (!original) {
				return row;
			}
			return { ...row, name: normalizeUrl(original) };
		});
	}

	if (config.plugins?.normalizeGeo) {
		result = result.map((row) => {
			const name = str(row.country) || str(row.name);
			if (!name) {
				return row;
			}
			const code = getCountryCode(name);
			return { ...row, country_code: code, country_name: getCountryName(code) };
		});
	}

	if (config.plugins?.deduplicateGeo) {
		const getKey = (r: DataRow) => r.country_code || str(r.name);
		const hasRevenue = result.some((r) => toNumber(r.revenue) > 0);
		result = aggregateRows(
			result,
			hasRevenue
				? {
						getKey,
						getName: (row, key) => str(row.country_name) || key,
						sumFields: ["revenue", "transactions", "customers"],
						sortBy: "revenue",
					}
				: {
						getKey,
						sumFields: ["pageviews", "visitors"],
						sortBy: "visitors",
					}
		);
	}

	return result;
}

function getReferrerInput(row: DataRow): string {
	return str(row.referrer) || str(row.source) || str(row.name);
}

function canonicalReferrerSource(type: string, rawSource: string): string {
	return type === "direct" ? DIRECT_SOURCE : rawSource;
}

function getReferrerAggregateOptions(rows: DataRow[]): {
	sortBy: keyof DataRow;
	sumFields: (keyof DataRow)[];
} {
	if (rows.some((row) => row.clicks !== undefined)) {
		return { sumFields: ["clicks"], sortBy: "clicks" };
	}
	const hasVisitors = rows.some((row) => row.visitors !== undefined);
	const hasPageviews = rows.some((row) => row.pageviews !== undefined);
	const sumFields: (keyof DataRow)[] = [];
	if (hasPageviews) {
		sumFields.push("pageviews");
	}
	if (hasVisitors) {
		sumFields.push("visitors");
	}
	return {
		sumFields,
		sortBy: hasVisitors ? "visitors" : "pageviews",
	};
}

interface AggregateOptions {
	getKey: (row: DataRow) => string;
	getName?: (row: DataRow, key: string) => string;
	sortBy: keyof DataRow;
	sumFields: (keyof DataRow)[];
}

function aggregateRows(rows: DataRow[], opts: AggregateOptions): DataRow[] {
	const grouped = new Map<string, DataRow>();
	const getName = opts.getName || ((_row, key) => key);

	for (const row of rows) {
		const key = opts.getKey(row);
		if (!key) {
			continue;
		}

		const existing = grouped.get(key);
		if (existing) {
			for (const field of opts.sumFields) {
				(existing as Record<string, unknown>)[field as string] =
					toNumber(existing[field]) + toNumber(row[field]);
			}
		} else {
			grouped.set(key, { ...row, name: getName(row, key) });
		}
	}

	const result = Array.from(grouped.values());
	const total = result.reduce((sum, r) => sum + toNumber(r[opts.sortBy]), 0);

	for (const row of result) {
		row.percentage =
			total > 0
				? Math.round((toNumber(row[opts.sortBy]) / total) * 10_000) / 100
				: 0;
	}

	return result.sort(
		(a, b) => toNumber(b[opts.sortBy]) - toNumber(a[opts.sortBy])
	);
}

function normalizeUrl(original: string): string {
	try {
		let path = original;
		if (path.startsWith("http://") || path.startsWith("https://")) {
			path = new URL(path).pathname || "/";
		}
		if (!path.startsWith("/")) {
			path = `/${path}`;
		}
		if (path.length > 1 && path.endsWith("/")) {
			path = path.slice(0, -1);
		}
		return path;
	} catch {
		return original;
	}
}

import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import { referrers } from "@databuddy/shared/lists/referrers";
import type { SimpleQueryConfig } from "./types";

interface DataRow {
	country_code?: string;
	country_name?: string;
	customers?: number;
	domain?: string;
	name?: string;
	pageviews?: number;
	percentage?: number;
	referrer?: string;
	revenue?: number;
	transactions?: number;
	visitors?: number;
	[key: string]: unknown;
}

const toNumber = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

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
			const url = str(row.name) || str(row.referrer);
			if (!url) {
				return row;
			}
			const parsed = parseReferrer(url, websiteDomain);
			return {
				...row,
				name: parsed.name,
				referrer: url,
				domain: parsed.domain,
			};
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

function parseReferrer(referrerUrl: string, currentDomain?: string | null) {
	const direct = { type: "direct", name: "Direct", url: "", domain: "" };

	try {
		const url = new URL(referrerUrl);
		const hostname = url.hostname;

		if (
			currentDomain &&
			(hostname === currentDomain || hostname.endsWith(`.${currentDomain}`))
		) {
			return direct;
		}

		const match = lookupReferrer(hostname);
		if (match) {
			return {
				type: match.type,
				name: match.name,
				url: referrerUrl,
				domain: hostname,
			};
		}

		const hasSearchParam =
			url.searchParams.has("q") ||
			url.searchParams.has("query") ||
			url.searchParams.has("search");
		return {
			type: hasSearchParam ? "search" : "unknown",
			name: hostname,
			url: referrerUrl,
			domain: hostname,
		};
	} catch {
		return { ...direct, url: referrerUrl };
	}
}

function lookupReferrer(domain: string): { type: string; name: string } | null {
	if (domain in referrers) {
		return referrers[domain] || null;
	}

	const parts = domain.split(".");
	for (let i = 1; i < parts.length - 1; i++) {
		const partial = parts.slice(i).join(".");
		if (partial in referrers) {
			return referrers[partial] || null;
		}
	}
	return null;
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

const UNSAFE_SQL = /;|--|\/\*|\*\//;

export function buildWhereClause(conditions?: string[]): string {
	if (!conditions?.length) {
		return "";
	}
	const safe = conditions.filter((c) => !UNSAFE_SQL.test(c));
	return `WHERE (${safe.join(" AND ")})`;
}

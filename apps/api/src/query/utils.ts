import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import { referrers } from "@databuddy/shared/lists/referrers";
import { mapScreenResolutionToDeviceType } from "./screen-resolution-to-device-type";
import type { SimpleQueryConfig } from "./types";

interface DataRow {
	name?: string;
	pageviews?: number;
	visitors?: number;
	percentage?: number;
	referrer?: string;
	domain?: string;
	country_code?: string;
	country_name?: string;
	[key: string]: unknown;
};

const toNumber = (v: unknown): number => (typeof v === "number" ? v : 0);
const toStringFn = (v: unknown): string => (typeof v === "string" ? v : "");

const REFERRER_QUERY_TYPES = ["top_referrers", "referrer", "traffic_sources"];

function shouldParseReferrers(config: SimpleQueryConfig): boolean {
	if (config.plugins?.parseReferrers) {
		return true;
	}
	const name =
		(config as { type?: string; name?: string }).type ||
		(config as { type?: string; name?: string }).name;
	return name ? REFERRER_QUERY_TYPES.includes(name) : false;
}

export function applyPlugins(
	data: DataRow[],
	config: SimpleQueryConfig,
	websiteDomain?: string | null
): DataRow[] {
	let result = data;

	if (shouldParseReferrers(config)) {
		result = result.map((row) => {
			const url = toStringFn(row.name) || toStringFn(row.referrer);
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
			const original = toStringFn(row.name);
			if (!original) {
				return row;
			}
			return { ...row, name: normalizeUrl(original) };
		});
	}

	if (config.plugins?.normalizeGeo) {
		result = result.map((row) => {
			const name = toStringFn(row.country) || toStringFn(row.name);
			if (!name) {
				return row;
			}
			const code = getCountryCode(name);
			return { ...row, country_code: code, country_name: getCountryName(code) };
		});
	}

	if (config.plugins?.deduplicateGeo) {
		result = aggregateByKey(
			result,
			(r) => r.country_code || toStringFn(r.name)
		);
	}

	if (config.plugins?.mapDeviceTypes) {
		result = aggregateByKey(result, (r) =>
			mapScreenResolutionToDeviceType(toStringFn(r.name))
		);
	}

	return result;
}

function aggregateByKey(
	rows: DataRow[],
	getKey: (row: DataRow) => string
): DataRow[] {
	const grouped = new Map<string, DataRow>();

	for (const row of rows) {
		const key = getKey(row);
		if (!key) {
			continue;
		}

		const existing = grouped.get(key);
		if (existing) {
			existing.pageviews =
				toNumber(existing.pageviews) + toNumber(row.pageviews);
			existing.visitors = toNumber(existing.visitors) + toNumber(row.visitors);
		} else {
			grouped.set(key, { ...row, name: key });
		}
	}

	const result = Array.from(grouped.values());
	const total = result.reduce((sum, r) => sum + toNumber(r.visitors), 0);

	for (const row of result) {
		row.percentage =
			total > 0
				? Math.round((toNumber(row.visitors) / total) * 10_000) / 100
				: 0;
	}

	return result.sort((a, b) => toNumber(b.visitors) - toNumber(a.visitors));
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

import { getCountryCode, getCountryName, referrers } from '@databuddy/shared';
import { mapScreenResolutionToDeviceType } from './screen-resolution-to-device-type';
import type { SimpleQueryConfig } from './types';

export interface ParsedReferrer {
	type: string;
	name: string;
	domain: string;
	url: string;
}

function parseReferrer(
	referrerUrl: string | null | undefined,
	currentDomain?: string | null
): ParsedReferrer {
	if (!referrerUrl) {
		return { type: 'direct', name: 'Direct', url: '', domain: '' };
	}

	try {
		const url = new URL(referrerUrl);
		const hostname = url.hostname;

		if (
			currentDomain &&
			(hostname === currentDomain || hostname.endsWith(`.${currentDomain}`))
		) {
			return { type: 'direct', name: 'Direct', url: '', domain: '' };
		}

		const match = getReferrerByDomain(hostname);
		if (match) {
			return {
				type: match.type,
				name: match.name,
				url: referrerUrl,
				domain: hostname,
			};
		}

		if (
			url.searchParams.has('q') ||
			url.searchParams.has('query') ||
			url.searchParams.has('search')
		) {
			return {
				type: 'search',
				name: hostname,
				url: referrerUrl,
				domain: hostname,
			};
		}

		return {
			type: 'unknown',
			name: hostname,
			url: referrerUrl,
			domain: hostname,
		};
	} catch {
		return { type: 'direct', name: 'Direct', url: referrerUrl, domain: '' };
	}
}

function getReferrerByDomain(
	domain: string
): { type: string; name: string } | null {
	if (domain in referrers) {
		const match = referrers[domain];
		return match || null;
	}

	const parts = domain.split('.');
	for (let i = 1; i < parts.length - 1; i++) {
		const partial = parts.slice(i).join('.');
		if (partial in referrers) {
			const match = referrers[partial];
			return match || null;
		}
	}
	return null;
}

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
}

const getNumber = (value: unknown): number =>
	typeof value === 'number' ? value : 0;

const getString = (value: unknown): string =>
	typeof value === 'string' ? value : '';

export function applyPlugins(
	data: DataRow[],
	config: SimpleQueryConfig,
	websiteDomain?: string | null
): DataRow[] {
	let result = data;

	if (shouldApplyReferrerParsing(config)) {
		result = applyReferrerParsing(result, websiteDomain);
	}

	if (config.plugins?.normalizeUrls) {
		result = applyUrlNormalization(result);
	}

	if (config.plugins?.normalizeGeo) {
		result = applyGeoNormalization(result);
	}

	if (config.plugins?.deduplicateGeo) {
		result = deduplicateGeoRows(result);
	}

	if (config.plugins?.mapDeviceTypes) {
		result = mapDeviceTypesPlugin(result);
	}

	return result;
}

export function deduplicateGeoRows(rows: DataRow[]): DataRow[] {
	const aggregated = new Map<string, DataRow>();
	let totalVisitors = 0;
	for (const row of rows) {
		const code = row.country_code || getString(row.name);
		if (!code) {
			continue;
		}
		if (aggregated.has(code)) {
			const existing = aggregated.get(code);
			if (existing) {
				existing.pageviews =
					getNumber(existing.pageviews) + getNumber(row.pageviews);
				existing.visitors =
					getNumber(existing.visitors) + getNumber(row.visitors);
			}
		} else {
			aggregated.set(code, { ...row });
		}
	}
	for (const row of aggregated.values()) {
		totalVisitors += getNumber(row.visitors);
	}
	for (const row of aggregated.values()) {
		row.percentage =
			totalVisitors > 0
				? Math.round((getNumber(row.visitors) / totalVisitors) * 100)
				: 0;
	}
	return Array.from(aggregated.values());
}

function shouldApplyReferrerParsing(config: SimpleQueryConfig): boolean {
	return (
		Boolean(config.plugins?.parseReferrers) || shouldAutoParseReferrers(config)
	);
}

function applyReferrerParsing(
	data: DataRow[],
	websiteDomain?: string | null
): DataRow[] {
	return data.map((row) => {
		const referrerUrl = getString(row.name) || getString(row.referrer);
		if (!referrerUrl) {
			return row;
		}

		const parsed = parseReferrer(referrerUrl, websiteDomain);

		return {
			...row,
			name: parsed.name,
			referrer: referrerUrl,
			domain: parsed.domain,
		} as DataRow;
	});
}

function applyGeoNormalization(data: DataRow[]): DataRow[] {
	return data.map((row) => {
		const currentName = getString(row.country) || getString(row.name);
		if (!currentName) {
			return row;
		}
		const code = getCountryCode(currentName);
		const name = getCountryName(code);
		return {
			...row,
			country_code: code,
			country_name: name,
		} as DataRow;
	});
}

function shouldAutoParseReferrers(
	config: SimpleQueryConfig | { type?: string; name?: string }
): boolean {
	const referrerConfigs = ['top_referrers', 'referrer', 'traffic_sources'];
	const typeOrName =
		(config as { type?: string; name?: string }).type ||
		(config as { type?: string; name?: string }).name;
	return typeOrName ? referrerConfigs.includes(typeOrName) : false;
}

/**
 * Groups and maps screen resolutions to device types, summing pageviews/visitors by type.
 * Preserves all original fields (e.g., percentage) from the first row of each device type.
 */
export function mapDeviceTypesPlugin(rows: DataRow[]): DataRow[] {
	const grouped = new Map<string, DataRow>();
	for (const row of rows) {
		const name = getString(row.name);
		const deviceType = mapScreenResolutionToDeviceType(name);
		if (!grouped.has(deviceType)) {
			grouped.set(deviceType, { ...row, name: deviceType });
		}
		const agg = grouped.get(deviceType);
		if (agg) {
			agg.pageviews = getNumber(agg.pageviews) + getNumber(row.pageviews);
			agg.visitors = getNumber(agg.visitors) + getNumber(row.visitors);
			const aggPct = agg.percentage;
			const rowPct = row.percentage;
			if (typeof aggPct === 'number' && typeof rowPct === 'number') {
				agg.percentage = aggPct + rowPct;
			}
		}
	}
	let totalPageviews = 0;
	for (const row of grouped.values()) {
		totalPageviews += getNumber(row.pageviews);
	}
	for (const row of grouped.values()) {
		row.percentage =
			totalPageviews > 0
				? Math.round((getNumber(row.pageviews) / totalPageviews) * 10_000) / 100
				: 0;
	}
	return Array.from(grouped.values());
}

function applyUrlNormalization(data: DataRow[]): DataRow[] {
	return data.map((row) => {
		const original = getString(row.name);
		if (!original) {
			return row;
		}
		let normalized = original;
		try {
			if (
				normalized.startsWith('http://') ||
				normalized.startsWith('https://')
			) {
				const url = new URL(normalized);
				normalized = url.pathname || '/';
			}
			if (!normalized.startsWith('/')) {
				normalized = `/${normalized}`;
			}
			if (normalized.length > 1 && normalized.endsWith('/')) {
				normalized = normalized.slice(0, -1);
			}
			return { ...row, name: normalized } as DataRow;
		} catch {
			return row;
		}
	});
}

const UNSAFE_CLAUSE_REGEX = /;|--|\/\*|\*\//;

export function buildWhereClause(conditions?: string[]): string {
	if (!conditions?.length) {
		return '';
	}

	const safeClauses = conditions.filter(
		(clause) => !UNSAFE_CLAUSE_REGEX.test(clause)
	);
	return `AND (${safeClauses.join(' AND ')})`;
}

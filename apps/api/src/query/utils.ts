import { getCountryCode, getCountryName, referrers } from '@databuddy/shared';
import { mapScreenResolutionToDeviceType } from './screen-resolution-to-device-type';

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

export function applyPlugins(
	data: Record<string, any>[],
	config: any,
	websiteDomain?: string | null
): Record<string, any>[] {
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

export function deduplicateGeoRows(
	rows: Record<string, any>[]
): Record<string, any>[] {
	const map = new Map<string, Record<string, any>>();
	let totalVisitors = 0;
	for (const row of rows) {
		const code = row.country_code || row.name;
		if (!code) {
			continue;
		}
		if (map.has(code)) {
			const existing = map.get(code);
			if (existing) {
				existing.pageviews += row.pageviews || 0;
				existing.visitors += row.visitors || 0;
			}
			// Optionally, merge other fields as needed
		} else {
			map.set(code, { ...row });
		}
	}
	// Recalculate total visitors for percentage
	for (const row of map.values()) {
		totalVisitors += row.visitors || 0;
	}
	for (const row of map.values()) {
		row.percentage =
			totalVisitors > 0 ? Math.round((row.visitors / totalVisitors) * 100) : 0;
	}
	return Array.from(map.values());
}

function shouldApplyReferrerParsing(config: any): boolean {
	return config.plugins?.parseReferrers || shouldAutoParseReferrers(config);
}

function applyReferrerParsing(
	data: Record<string, any>[],
	websiteDomain?: string | null
): Record<string, any>[] {
	return data.map((row) => {
		const referrerUrl = row.name || row.referrer;
		if (!referrerUrl) {
			return row;
		}

		const parsed = parseReferrer(referrerUrl, websiteDomain);

		return {
			...row,
			name: parsed.name,
			referrer: referrerUrl,
			domain: parsed.domain,
		};
	});
}

function applyUrlNormalization(
	data: Record<string, any>[]
): Record<string, any>[] {
	return data.map((row) => {
		if (row.path) {
			try {
				const url = new URL(
					row.path.startsWith('http')
						? row.path
						: `https://example.com${row.path}`
				);
				row.path_clean = url.pathname;
			} catch {
				row.path_clean = row.path;
			}
		}
		return row;
	});
}

function applyGeoNormalization(
	data: Record<string, any>[]
): Record<string, any>[] {
	return data.map((row) => {
		// Only normalize if row has a 'name' field (country/region/etc)
		if (!row.name) {
			return row;
		}
		const code = getCountryCode(row.name);
		const name = getCountryName(code);
		return {
			...row,
			country_code: code,
			country_name: name,
		};
	});
}

function shouldAutoParseReferrers(config: any): boolean {
	const referrerConfigs = ['top_referrers', 'referrer', 'traffic_sources'];
	return referrerConfigs.includes(config.type || config.name);
}

/**
 * Groups and maps screen resolutions to device types, summing pageviews/visitors by type.
 * Preserves all original fields (e.g., percentage) from the first row of each device type.
 */
export function mapDeviceTypesPlugin(
	rows: Record<string, any>[]
): Record<string, any>[] {
	const map = new Map<string, Record<string, any>>();
	for (const row of rows) {
		const deviceType = mapScreenResolutionToDeviceType(row.name);
		if (!map.has(deviceType)) {
			map.set(deviceType, { ...row, name: deviceType });
		}
		const agg = map.get(deviceType);
		if (agg) {
			agg.pageviews = (agg.pageviews || 0) + (row.pageviews || 0);
			agg.visitors = (agg.visitors || 0) + (row.visitors || 0);
			if (
				typeof agg.percentage === 'number' &&
				typeof row.percentage === 'number'
			) {
				agg.percentage += row.percentage;
			}
		}
	}
	let totalPageviews = 0;
	for (const row of map.values()) {
		totalPageviews += row.pageviews || 0;
	}
	for (const row of map.values()) {
		row.percentage =
			totalPageviews > 0
				? Math.round((row.pageviews / totalPageviews) * 10_000) / 100
				: 0;
	}
	return Array.from(map.values());
}

import { chQuery } from "@databuddy/db";

// TODO(DAT-100): dedupe expression constants once shared package lands
const NORMALIZED_PATH_EXPR =
	"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END";
const NORMALIZED_REFERRER_EXPR = `
			CASE
				WHEN referrer = '' OR referrer IS NULL THEN 'direct'
				WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com'
				WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com'
				WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com'
				WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com'
				ELSE concat('https://', domain(referrer))
			END`;

export interface DimensionRow {
	current: number;
	key: string;
	label: string;
	previous: number;
}

export interface DimensionResult extends DimensionRow {
	change: number;
}

export type DimensionKind = "country" | "page" | "referrer";

export function mergeDimensionRows(
	rows: DimensionRow[],
	limit = 5
): DimensionResult[] {
	if (rows.length === 0) {
		return [];
	}

	const map = new Map<
		string,
		{ label: string; current: number; previous: number }
	>();

	for (const row of rows) {
		const existing = map.get(row.key);
		if (existing) {
			existing.current += row.current;
			existing.previous += row.previous;
		} else {
			map.set(row.key, {
				label: row.label,
				current: row.current,
				previous: row.previous,
			});
		}
	}

	const results: DimensionResult[] = [];
	for (const [key, val] of map) {
		const change =
			val.previous > 0
				? ((val.current - val.previous) / val.previous) * 100
				: 0;
		results.push({
			key,
			label: val.label,
			current: val.current,
			previous: val.previous,
			change,
		});
	}

	results.sort((a, b) => b.current - a.current);

	return results.slice(0, limit);
}

const DIMENSION_EXPR: Record<
	DimensionKind,
	{ expr: string; emptyFilter: string }
> = {
	country: { expr: "country", emptyFilter: "c.key != ''" },
	page: {
		expr: NORMALIZED_PATH_EXPR,
		emptyFilter: "c.key != ''",
	},
	referrer: {
		expr: NORMALIZED_REFERRER_EXPR,
		emptyFilter: "c.key != 'direct'",
	},
};

export async function fetchOrgDimensions(
	websiteIds: string[],
	rangeDays: number,
	kind: DimensionKind,
	limit = 5
): Promise<DimensionResult[]> {
	if (websiteIds.length === 0) {
		return [];
	}

	const { expr: colExpr, emptyFilter } = DIMENSION_EXPR[kind];
	const lookbackDays = rangeDays * 2;
	const fetchLimit = limit * 3;

	const sql = `
WITH
  current_window AS (
    SELECT (${colExpr}) AS key, count() AS value
    FROM analytics.events
    WHERE client_id IN {websiteIds:Array(String)}
      AND event_name = 'screen_view'
      AND session_id != ''
      AND time >= today() - {rangeDays:UInt32} + 1
      AND time < today() + 1
    GROUP BY key
  ),
  previous_window AS (
    SELECT (${colExpr}) AS key, count() AS value
    FROM analytics.events
    WHERE client_id IN {websiteIds:Array(String)}
      AND event_name = 'screen_view'
      AND session_id != ''
      AND time >= today() - {lookbackDays:UInt32} + 1
      AND time < today() - {rangeDays:UInt32} + 1
    GROUP BY key
  )
SELECT
  c.key AS key,
  c.key AS label,
  toInt64(c.value) AS current,
  toInt64(ifNull(p.value, 0)) AS previous
FROM current_window c
LEFT JOIN previous_window p ON p.key = c.key
WHERE ${emptyFilter}
ORDER BY current DESC
LIMIT {fetchLimit:UInt32}
`;

	const rawRows = await chQuery<{
		key: unknown;
		label: unknown;
		current: unknown;
		previous: unknown;
	}>(sql, { websiteIds, rangeDays, lookbackDays, fetchLimit });

	const dimRows: DimensionRow[] = rawRows.map((r) => ({
		key: String(r.key),
		label: String(r.label),
		current: Number(r.current ?? 0),
		previous: Number(r.previous ?? 0),
	}));

	return mergeDimensionRows(dimRows, limit);
}

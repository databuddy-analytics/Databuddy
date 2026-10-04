import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { getAppContext, resolveToolWebsite, toolDateRangeError } from "./utils";
import { createCachedTokenFn } from "./utils/oauth-token";

const GSC_API = "https://www.googleapis.com/webmasters/v3";
export const SEARCH_CONSOLE_SCOPE =
	"https://www.googleapis.com/auth/webmasters.readonly";
const MAX_ROWS = 25;

const dimensionEnum = z.enum(["query", "page", "country", "device", "date"]);

const searchAnalyticsInput = z.object({
	websiteId: z
		.string()
		.optional()
		.describe("Target website id. Omit to use the workspace default."),
	startDate: z.iso.date().describe("Start date YYYY-MM-DD"),
	endDate: z.iso.date().describe("End date YYYY-MM-DD"),
	dimensions: dimensionEnum
		.array()
		.min(1)
		.max(3)
		.describe(
			"Dimensions to group by. 'query' for keywords, 'page' for URLs, 'date' for daily trends."
		),
	rowLimit: z.number().min(1).max(MAX_ROWS).optional().default(MAX_ROWS),
});

export interface SearchConsoleRow {
	clicks: number;
	ctr: number;
	impressions: number;
	position: number;
	[dimension: string]: string | number;
}

type SearchAnalyticsInput = z.infer<typeof searchAnalyticsInput>;

interface SearchAnalyticsApiRow {
	clicks: number;
	ctr: number;
	impressions: number;
	keys: string[];
	position: number;
}

interface SearchAnalyticsApiResponse {
	metadata?: { first_incomplete_date?: string };
	rows: SearchAnalyticsApiRow[];
}

async function requestSearchAnalytics(
	token: string,
	siteUrl: string,
	query: Pick<SearchAnalyticsInput, "dimensions" | "endDate" | "startDate"> & {
		dataState: "all" | "final";
		rowLimit?: number;
	}
): Promise<SearchAnalyticsApiResponse | { error: string }> {
	const res = await fetch(
		`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(query),
			signal: AbortSignal.timeout(15_000),
		}
	);

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		return { error: `Search Console API ${res.status}: ${body.slice(0, 200)}` };
	}

	const data = (await res.json()) as Partial<SearchAnalyticsApiResponse>;
	return { metadata: data.metadata, rows: data.rows ?? [] };
}

export async function querySearchAnalytics(
	token: string,
	siteUrl: string,
	input: SearchAnalyticsInput
): Promise<
	| {
			finalThrough: string | null;
			provisional: boolean | null;
			rows: SearchConsoleRow[];
			siteUrl: string;
			truncated: boolean;
	  }
	| { error: string }
> {
	const requestedRows = requestSearchAnalytics(token, siteUrl, {
		startDate: input.startDate,
		endDate: input.endDate,
		dimensions: input.dimensions,
		rowLimit: input.rowLimit,
		dataState: "all",
	});
	const [result, freshness] = await Promise.all([
		requestedRows,
		input.dimensions.includes("date")
			? requestedRows
			: requestSearchAnalytics(token, siteUrl, {
					startDate: input.startDate,
					endDate: input.endDate,
					dimensions: ["date"],
					dataState: "all",
				}).catch(() => null),
	]);
	if ("error" in result) {
		return result;
	}

	const firstIncompleteDate =
		freshness && !("error" in freshness)
			? freshness.metadata?.first_incomplete_date
			: undefined;
	const finalThrough = firstIncompleteDate
		? new Date(Date.parse(firstIncompleteDate) - 86_400_000)
				.toISOString()
				.slice(0, 10)
		: null;
	const rows: SearchConsoleRow[] = result.rows.map((row) => {
		const entry: Record<string, string | number> = {};
		for (const [index, dimension] of input.dimensions.entries()) {
			const key = row.keys[index];
			if (key !== undefined) {
				entry[dimension] = key;
			}
		}
		entry.clicks = row.clicks;
		entry.impressions = row.impressions;
		entry.ctr = Math.round(row.ctr * 1000) / 10;
		entry.position = Math.round(row.position * 10) / 10;
		return entry as SearchConsoleRow;
	});

	return {
		siteUrl,
		finalThrough,
		provisional: firstIncompleteDate
			? firstIncompleteDate <= input.endDate
			: null,
		truncated: rows.length === input.rowLimit,
		rows,
	};
}

export function createSearchConsoleTools(params: {
	domain?: string;
	organizationId: string;
	userId?: string;
}) {
	const getToken = createCachedTokenFn(
		"google",
		params.organizationId,
		params.userId,
		SEARCH_CONSOLE_SCOPE
	);

	return {
		search_console: tool({
			description:
				"Query Google Search Console for a workspace website. Returns search queries, pages, countries, or devices with clicks, impressions, CTR, and average position. Use to find which keywords lost rankings, which pages dropped in impressions, or where traffic is coming from in Google search. Days after finalThrough are provisional and may still change; null finalThrough/provisional means the provider did not supply a freshness cutoff. Search Console dates use America/Los_Angeles.",
			inputSchema: searchAnalyticsInput,
			execute: async (input, options) => {
				const ctx = getAppContext(options);
				const dateError = toolDateRangeError(
					input.startDate,
					input.endDate,
					ctx
				);
				if (dateError) {
					return { error: dateError };
				}
				let domain = params.domain;
				if (input.websiteId || !domain) {
					const resolved = resolveToolWebsite(ctx, input.websiteId);
					domain =
						resolved.domain ||
						(await getWebsiteDomain(resolved.websiteId)) ||
						undefined;
				}
				if (!domain) {
					return {
						error: "Could not resolve a domain for the target website",
					};
				}
				const siteUrl = `sc-domain:${domain}`;

				const token = await getToken();
				if (!token) {
					return {
						error:
							"No Google account connected. Connect Google in Settings > Integrations with Search Console scope.",
					};
				}
				try {
					return await querySearchAnalytics(token, siteUrl, input);
				} catch (err) {
					return {
						error: `Search Console query failed: ${(err as Error).message?.slice(0, 200)}`,
					};
				}
			},
		}),
	};
}

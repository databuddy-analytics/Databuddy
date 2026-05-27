import { tool } from "ai";
import { z } from "zod";
import { createCachedTokenFn } from "./utils/oauth-token";

const GSC_API = "https://www.googleapis.com/webmasters/v3";
const MAX_ROWS = 25;

const dimensionEnum = z.enum(["query", "page", "country", "device", "date"]);

const searchAnalyticsInput = z.object({
	startDate: z.string().describe("Start date YYYY-MM-DD"),
	endDate: z.string().describe("End date YYYY-MM-DD"),
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

export async function querySearchAnalytics(
	token: string,
	siteUrl: string,
	input: z.infer<typeof searchAnalyticsInput>
): Promise<
	| { rows: SearchConsoleRow[]; siteUrl: string; rowCount: number }
	| { error: string }
> {
	const res = await fetch(
		`${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				startDate: input.startDate,
				endDate: input.endDate,
				dimensions: input.dimensions,
				rowLimit: input.rowLimit,
				dataState: "final",
			}),
			signal: AbortSignal.timeout(15_000),
		}
	);

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		return { error: `Search Console API ${res.status}: ${body.slice(0, 200)}` };
	}

	const data = (await res.json()) as {
		rows?: Array<{
			keys: string[];
			clicks: number;
			impressions: number;
			ctr: number;
			position: number;
		}>;
	};

	const rows: SearchConsoleRow[] = (data.rows ?? []).map((row) => {
		const entry: Record<string, string | number> = {};
		for (let i = 0; i < input.dimensions.length; i++) {
			entry[input.dimensions[i]] = row.keys[i];
		}
		entry.clicks = row.clicks;
		entry.impressions = row.impressions;
		entry.ctr = Math.round(row.ctr * 1000) / 10;
		entry.position = Math.round(row.position * 10) / 10;
		return entry as SearchConsoleRow;
	});

	return { siteUrl, rowCount: rows.length, rows };
}

export function createSearchConsoleTools(params: {
	domain: string;
	organizationId: string;
	userId?: string;
}) {
	const getToken = createCachedTokenFn(
		"google",
		params.organizationId,
		params.userId
	);
	const siteUrl = `sc-domain:${params.domain}`;

	return {
		search_console: tool({
			description: `Query Google Search Console for ${params.domain}. Returns search queries, pages, countries, or devices with clicks, impressions, CTR, and average position. Use to find which keywords lost rankings, which pages dropped in impressions, or where traffic is coming from in Google search.`,
			inputSchema: searchAnalyticsInput,
			execute: async (input) => {
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

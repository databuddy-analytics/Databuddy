import dayjs from "dayjs";
import { useLogger } from "evlog/elysia";
import { executeQuery } from "../../query";
import type { WebPeriodData, WeekOverWeekPeriod } from "./types";

const QUERY_FETCH_TIMEOUT_MS = 45_000;

function runQueryWithTimeout<T>(
	label: string,
	fn: () => Promise<T>
): Promise<T> {
	return Promise.race([
		fn(),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, QUERY_FETCH_TIMEOUT_MS);
		}),
	]);
}

export function getWeekOverWeekPeriod(): WeekOverWeekPeriod {
	const now = dayjs();
	return {
		current: {
			from: now.subtract(7, "day").format("YYYY-MM-DD"),
			to: now.format("YYYY-MM-DD"),
		},
		previous: {
			from: now.subtract(14, "day").format("YYYY-MM-DD"),
			to: now.subtract(7, "day").format("YYYY-MM-DD"),
		},
	};
}

export async function fetchWebPeriodData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<WebPeriodData> {
	const base = { projectId: websiteId, from, to, timezone };

	const safe = async (
		label: string,
		run: () => Promise<Record<string, unknown>[]>
	): Promise<Record<string, unknown>[]> => {
		try {
			const value = await runQueryWithTimeout(label, run);
			return Array.isArray(value) ? value : [];
		} catch (error) {
			useLogger().warn("Insights period query failed or timed out", {
				insights: { websiteId, label, error },
			});
			return [];
		}
	};

	const [
		summary,
		topPages,
		errorSummary,
		topReferrers,
		countries,
		browsers,
		vitalsOverview,
	] = await Promise.all([
		safe("summary_metrics", () =>
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone)
		),
		safe("top_pages", () =>
			executeQuery({ ...base, type: "top_pages", limit: 10 }, domain, timezone)
		),
		safe("error_summary", () =>
			executeQuery({ ...base, type: "error_summary" }, domain, timezone)
		),
		safe("top_referrers", () =>
			executeQuery(
				{ ...base, type: "top_referrers", limit: 10 },
				domain,
				timezone
			)
		),
		safe("country", () =>
			executeQuery({ ...base, type: "country", limit: 8 }, domain, timezone)
		),
		safe("browser_name", () =>
			executeQuery(
				{ ...base, type: "browser_name", limit: 8 },
				domain,
				timezone
			)
		),
		safe("vitals_overview", () =>
			executeQuery({ ...base, type: "vitals_overview" }, domain, timezone)
		),
	]);

	return {
		summary,
		topPages,
		errorSummary,
		topReferrers,
		countries,
		browsers,
		vitalsOverview,
	};
}

export async function hasWebInsightData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<boolean> {
	const base = { projectId: websiteId, from, to, timezone };
	const safe = async (
		label: string,
		run: () => Promise<Record<string, unknown>[]>
	): Promise<Record<string, unknown>[]> => {
		try {
			const value = await runQueryWithTimeout(label, run);
			return Array.isArray(value) ? value : [];
		} catch {
			return [];
		}
	};

	const [summary, topPages] = await Promise.all([
		safe("summary_metrics", () =>
			executeQuery({ ...base, type: "summary_metrics" }, domain, timezone)
		),
		safe("top_pages", () =>
			executeQuery({ ...base, type: "top_pages", limit: 1 }, domain, timezone)
		),
	]);

	return summary.length > 0 || topPages.length > 0;
}

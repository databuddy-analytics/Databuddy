"use server";

import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { headers } from "next/headers";
import type {
	BatchQueryResponse,
	DynamicQueryRequest,
	DynamicQueryResponse,
} from "./types";

const DEMO_WEBSITE_ID = "OXmNQsViBT-FOS_wZCTHc";
const MAX_BATCH_SIZE = 5;
const MAX_LIMIT = 100;
const DEMO_DATE_DAYS = 30;

class DemoRateLimitError extends Error {
	constructor() {
		super("Too many demo queries — try again shortly.");
	}
}

function clampDates(
	startDate: string,
	endDate: string
): { startDate: string; endDate: string } {
	const today = new Date();
	const floor = new Date(Date.now() - DEMO_DATE_DAYS * 24 * 60 * 60 * 1000);
	const parsedStart = new Date(startDate);
	const parsedEnd = new Date(endDate);
	const safeStart = Number.isNaN(parsedStart.getTime())
		? floor
		: parsedStart < floor
			? floor
			: parsedStart;
	const safeEnd = Number.isNaN(parsedEnd.getTime())
		? today
		: parsedEnd > today
			? today
			: parsedEnd;
	return {
		startDate: safeStart.toISOString().split("T")[0],
		endDate: safeEnd.toISOString().split("T")[0],
	};
}

async function getClientIp(): Promise<string> {
	const hdrs = await headers();
	return (
		hdrs.get("cf-connecting-ip") ||
		hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		hdrs.get("x-real-ip") ||
		"unknown"
	);
}

async function enforceDemoRateLimit(): Promise<void> {
	const ip = await getClientIp();
	const rl = await ratelimit(`docs:query-demo:${ip}`, 20, 60);
	if (!rl.success) {
		getRateLimitHeaders(rl);
		throw new DemoRateLimitError();
	}
}

function buildQueryParams(
	startDate: string,
	endDate: string,
	timezone = "UTC"
): URLSearchParams {
	return new URLSearchParams({
		website_id: DEMO_WEBSITE_ID,
		start_date: startDate,
		end_date: endDate,
		timezone,
	});
}

async function executeDynamicQuery(
	startDate: string,
	endDate: string,
	queryData: DynamicQueryRequest | DynamicQueryRequest[],
	timezone = "UTC"
): Promise<DynamicQueryResponse | BatchQueryResponse> {
	try {
		await enforceDemoRateLimit();
		const safeDates = clampDates(startDate, endDate);
		const params = buildQueryParams(
			safeDates.startDate,
			safeDates.endDate,
			timezone
		);
		const url = `https://api.databuddy.cc/v1/query?${params}`;

		const capQuery = (query: DynamicQueryRequest) => ({
			...query,
			startDate: safeDates.startDate,
			endDate: safeDates.endDate,
			timeZone: timezone,
			limit: Math.min(query.limit || 100, MAX_LIMIT),
			page: query.page || 1,
			filters: query.filters || [],
			granularity: query.granularity || "daily",
		});

		if (Array.isArray(queryData) && queryData.length > MAX_BATCH_SIZE) {
			throw new Error(`Batch size cannot exceed ${MAX_BATCH_SIZE}`);
		}

		const requestBody = Array.isArray(queryData)
			? queryData.map(capQuery)
			: capQuery(queryData);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Api-Key": process.env.DATABUDDY_API_KEY as string,
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			throw new Error(`API responded with status: ${response.status}`);
		}

		const data = await response.json();

		if (!data.success) {
			throw new Error(data.error || "Failed to fetch dynamic query data");
		}

		return data;
	} catch (error) {
		console.error("Failed to execute dynamic query:", error);
		throw error;
	}
}

export async function executeQuery(
	startDate: string,
	endDate: string,
	queryRequest: DynamicQueryRequest,
	timezone = "UTC"
): Promise<DynamicQueryResponse> {
	try {
		const result = await executeDynamicQuery(
			startDate,
			endDate,
			queryRequest,
			timezone
		);

		if ("batch" in result) {
			throw new Error("Unexpected batch response for single query");
		}

		return result;
	} catch {
		return {
			success: false,
			queryId: queryRequest.id,
			data: [],
			meta: {
				parameters: queryRequest.parameters,
				total_parameters: queryRequest.parameters.length,
				page: queryRequest.page || 1,
				limit: queryRequest.limit || 100,
				filters_applied: queryRequest.filters?.length || 0,
			},
		};
	}
}

export async function executeBatchQueries(
	startDate: string,
	endDate: string,
	queries: DynamicQueryRequest[],
	timezone = "UTC"
): Promise<BatchQueryResponse> {
	try {
		const result = await executeDynamicQuery(
			startDate,
			endDate,
			queries,
			timezone
		);

		if (!("batch" in result)) {
			throw new Error("Expected batch response for multiple queries");
		}

		return result;
	} catch {
		return {
			success: false,
			batch: true,
			results: queries.map((query) => ({
				success: false,
				queryId: query.id,
				data: [],
				meta: {
					parameters: query.parameters,
					total_parameters: query.parameters.length,
					page: query.page || 1,
					limit: query.limit || 100,
					filters_applied: query.filters?.length || 0,
				},
			})),
		};
	}
}

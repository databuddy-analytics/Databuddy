import { executeQuery } from "../../query";

const PREFLIGHT_RETRY_DELAY_MS = 250;

export function resolveTrackedInsightData(
	results: PromiseSettledResult<Record<string, unknown>[]>[]
): boolean {
	const responses = results.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
	const hasData = responses.some((rows) =>
		rows.some((row) =>
			Object.values(row).some((value) => {
				const number = Number(value);
				return Number.isFinite(number) && number !== 0;
			})
		)
	);
	if (hasData) {
		return true;
	}
	const failure = results.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (failure) {
		throw failure.reason;
	}
	return false;
}

export async function hasTrackedInsightData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string,
	abortSignal?: AbortSignal,
	queryFn: typeof executeQuery = executeQuery,
	retryDelayMs = PREFLIGHT_RETRY_DELAY_MS
): Promise<boolean> {
	const request = { projectId: websiteId, from, to, timezone };
	const read = () =>
		Promise.allSettled(
			[
				"summary_metrics",
				"error_summary",
				"revenue_overview",
				"custom_events_discovery",
			].map((type) =>
				queryFn({ ...request, type }, domain, timezone, abortSignal)
			)
		);
	try {
		return resolveTrackedInsightData(await read());
	} catch (error) {
		if (
			abortSignal?.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw abortSignal?.reason ?? error;
		}
		await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		abortSignal?.throwIfAborted();
		return resolveTrackedInsightData(await read());
	}
}

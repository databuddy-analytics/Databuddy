import { executeQuery } from "../../query";

export async function hasTrackedInsightData(
	websiteId: string,
	domain: string,
	from: string,
	to: string,
	timezone: string
): Promise<boolean> {
	const request = { projectId: websiteId, from, to, timezone };
	const results = await Promise.allSettled(
		[
			"summary_metrics",
			"error_summary",
			"revenue_overview",
			"custom_events_discovery",
		].map((type) => executeQuery({ ...request, type }, domain, timezone))
	);
	const responses = results.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
	if (responses.length === 0) {
		const failure = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected"
		);
		throw failure?.reason ?? new Error("Insight data checks failed");
	}
	return responses.some((rows) =>
		rows.some((row) =>
			Object.values(row).some((value) => {
				const number = Number(value);
				return Number.isFinite(number) && number !== 0;
			})
		)
	);
}

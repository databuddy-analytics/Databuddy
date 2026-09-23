import { captureError, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import {
	createRequest,
	parseResponse,
	type Row,
	requestEvaluation,
	scanRequestSchema,
} from "@databuddy/scan/evaluate";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import { Elysia } from "elysia";
import { createError } from "evlog";
import { handleAppError } from "@/http/errors";

const maxBodyBytes = 256 * 1024;
const limits = [
	{ requests: 600, windowSeconds: 60 },
	{ requests: 5000, windowSeconds: 86_400 },
] as const;

function answersFrom(rows: Row[]) {
	return Object.fromEntries(
		rows.flatMap((row, index) => [
			[
				`coverage_${index}`,
				{
					choice: row.coverage,
					probabilities:
						row.coverageProbability === null
							? null
							: { [row.coverage]: row.coverageProbability },
				},
			],
			[
				`category_${index}`,
				{
					choice: row.category,
					probabilities:
						row.categoryProbability === null
							? null
							: { [row.category]: row.categoryProbability },
				},
			],
			[`priority_${index}`, { score: row.priority }],
		])
	);
}

function reject(
	request: Request,
	status: number,
	code: string,
	message: string,
	headers: Record<string, string> = {}
): Response {
	const response = handleAppError({
		error: createError({ code, message, status }),
		request,
	});
	for (const [name, value] of Object.entries(headers)) {
		response.headers.set(name, value);
	}
	return response;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export const scanRoute = new Elysia({ prefix: "/v1/scan" }).post(
	"/evaluate",
	async function evaluateScan({ request }) {
		const ip = getClientIp(request.headers) ?? "shared";
		for (const limit of limits) {
			const rl = await ratelimit(
				`scan:evaluate:${limit.windowSeconds}:${ip}`,
				limit.requests,
				limit.windowSeconds
			);
			if (!rl.success) {
				mergeWideEvent({ scan_rate_limited: true });
				return reject(
					request,
					429,
					"RATE_LIMITED",
					"Scan rate limit reached",
					getRateLimitHeaders(rl)
				);
			}
		}
		const text = await request.text();
		mergeWideEvent({ scan_request_bytes: Buffer.byteLength(text) });
		if (Buffer.byteLength(text) > maxBodyBytes) {
			return reject(
				request,
				413,
				"PAYLOAD_TOO_LARGE",
				"Scan request too large"
			);
		}
		const parsed = scanRequestSchema.safeParse(parseJson(text));
		if (!parsed.success) {
			return reject(request, 400, "BAD_REQUEST", "Invalid scan request");
		}
		const apiKey = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
		if (!apiKey) {
			captureError(new Error("AI_GATEWAY_API_KEY is not set"), {
				scan_route: true,
			});
			return reject(
				request,
				503,
				"SERVICE_UNAVAILABLE",
				"Scanning is temporarily unavailable"
			);
		}
		const { segments, catalog } = parsed.data;
		mergeWideEvent({ scan_segments: segments.length });
		try {
			const raw = await requestEvaluation(createRequest(segments, catalog), {
				apiKey,
				attempts: 1,
				timeoutMs: 15_000,
				signal: request.signal,
				onAttempt: (attempt) =>
					mergeWideEvent({
						scan_gateway_status: attempt.status ?? 0,
						scan_gateway_ms: attempt.ms,
					}),
				onRetry: () => undefined,
			});
			const { rows, inputTokens, outputTokens } = parseResponse(raw, segments);
			return {
				answers: answersFrom(rows),
				usage: { inputTokens, outputTokens },
			};
		} catch (error) {
			const timedOut = error instanceof Error && error.name === "TimeoutError";
			mergeWideEvent({ scan_failed: timedOut ? "timeout" : "gateway" });
			return reject(
				request,
				timedOut ? 504 : 503,
				"SERVICE_UNAVAILABLE",
				"Scanning is temporarily unavailable"
			);
		}
	}
);

import { createHmac } from "node:crypto";
import { captureError, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { runRateLimitCommand } from "@databuddy/redis";
import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import {
	createRequest,
	parseResponse,
	type Row,
	requestEvaluation,
	scanRequestSchema,
} from "@databuddy/scan/src/evaluate";
import { recordSelfAnalyticsEvent } from "@databuddy/services/billing-lifecycle";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import { Elysia } from "elysia";
import { createError } from "evlog";
import { handleAppError } from "@/http/errors";

const maxBodyBytes = 256 * 1024;
const runPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const versionPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const limits = [
	{ requests: 600, windowSeconds: 60 },
	{ requests: 5000, windowSeconds: 86_400 },
] as const;

function choice(value: string, probability: number | null) {
	return {
		choice: value,
		probabilities: probability === null ? null : { [value]: probability },
	};
}

function answersFrom(rows: Row[]) {
	return Object.fromEntries(
		rows.flatMap((row, index) => [
			[`coverage_${index}`, choice(row.coverage, row.coverageProbability)],
			[`category_${index}`, choice(row.category, row.categoryProbability)],
			[`priority_${index}`, { score: row.priority }],
		])
	);
}

function scanContext(headers: Headers) {
	const run = headers.get("x-databuddy-scan-run") ?? "";
	const version = headers.get("x-databuddy-scan-version") ?? "";
	return {
		run: runPattern.test(run) ? run : null,
		version: versionPattern.test(version) ? version : "unknown",
	};
}

async function recordRunStart(run: string, version: string) {
	const first = await runRateLimitCommand((redis) =>
		redis.set(`scan:run:${run}`, "1", "EX", 86_400, "NX")
	);
	if (first !== "OK") {
		return;
	}
	await recordSelfAnalyticsEvent({
		profileId: run,
		eventName: "scan_run_started",
		properties: { cli_version: version },
		source: "scan",
	});
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

async function readCapped(request: Request): Promise<string | null> {
	if (Number(request.headers.get("content-length")) > maxBodyBytes) {
		return null;
	}
	const reader = request.body?.getReader();
	if (!reader) {
		return "";
	}
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			return Buffer.concat(chunks).toString("utf8");
		}
		size += value.byteLength;
		if (size > maxBodyBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
}

export const scanRoute = new Elysia({ prefix: "/v1/scan" }).post(
	"/evaluate",
	async function evaluateScan({ request }) {
		const context = scanContext(request.headers);
		mergeWideEvent({
			scan_run: context.run ?? "none",
			scan_cli_version: context.version,
		});
		const caller = createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
			.update(getClientIp(request.headers) ?? "shared")
			.digest("hex")
			.slice(0, 16);
		for (const limit of limits) {
			const rl = await ratelimit(
				`scan:evaluate:${limit.windowSeconds}:${caller}`,
				limit.requests,
				limit.windowSeconds
			);
			if (rl.degraded) {
				mergeWideEvent({ scan_rate_limit_degraded: true });
				return reject(
					request,
					503,
					"SERVICE_UNAVAILABLE",
					"Scanning is temporarily unavailable"
				);
			}
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
		const text = await readCapped(request);
		if (text === null) {
			return reject(
				request,
				413,
				"PAYLOAD_TOO_LARGE",
				"Scan request too large"
			);
		}
		mergeWideEvent({ scan_request_bytes: Buffer.byteLength(text) });
		let parsed: ReturnType<typeof scanRequestSchema.safeParse> | null = null;
		try {
			parsed = scanRequestSchema.safeParse(JSON.parse(text));
		} catch {
			parsed = null;
		}
		if (!parsed?.success) {
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
		if (context.run) {
			recordRunStart(context.run, context.version).catch((error) =>
				captureError(error, { scan_event: "scan_run_started" })
			);
		}
		let gatewayStatus: number | null = null;
		try {
			const raw = await requestEvaluation(createRequest(segments, catalog), {
				apiKey,
				attempts: 2,
				timeoutMs: 15_000,
				signal: request.signal,
				onAttempt: (attempt) => {
					gatewayStatus = attempt.status;
					mergeWideEvent({
						scan_gateway_status: attempt.status ?? 0,
						scan_gateway_ms: attempt.ms,
					});
				},
				onRetry: () => undefined,
			});
			const { rows, inputTokens, outputTokens } = parseResponse(raw, segments);
			mergeWideEvent({
				scan_gaps: rows.filter(
					(row) => row.coverage === "missing" || row.coverage === "partial"
				).length,
				scan_covered: rows.filter((row) => row.coverage === "covered").length,
				scan_input_tokens: inputTokens,
			});
			return {
				answers: answersFrom(rows),
				usage: { inputTokens, outputTokens },
			};
		} catch (error) {
			const timedOut = error instanceof Error && error.name === "TimeoutError";
			mergeWideEvent({
				scan_failed: timedOut
					? "timeout"
					: gatewayStatus === 200
						? "invalid_response"
						: `gateway_${gatewayStatus ?? "network"}`,
			});
			return reject(
				request,
				timedOut ? 504 : 503,
				"SERVICE_UNAVAILABLE",
				"Scanning is temporarily unavailable"
			);
		}
	},
	{ parse: "none" }
);

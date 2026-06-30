import { connect } from "node:tls";
import { db } from "@databuddy/db";
import {
	safeFetch,
	SsrfError,
	validateUrl,
} from "@databuddy/shared/ssrf-guard";
import { CryptoHasher } from "bun";
import { Data, Effect } from "effect";
import { UPTIME_ENV } from "./lib/env";
import { extractHealth } from "./json-parser";
import { captureError } from "./lib/tracing";
import type { ActionResult, ScheduleLookupReason, UptimeData } from "./types";
import { MonitorStatus } from "./types";

const DEFAULT_TIMEOUT = 60_000;
const MAX_REDIRECTS = 10;

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const PROBE_REGION =
	process.env.PROBE_REGION || process.env.RAILWAY_REPLICA_REGION || "default";

interface FetchSuccess {
	bytes: number;
	content: string;
	contentType: string | null;
	ok: true;
	parsedJson?: unknown;
	redirects: number;
	statusCode: number;
	total: number;
	ttfb: number;
}

interface FetchFailure {
	error: string;
	ok: false;
	statusCode: number;
	total: number;
	ttfb: number;
}

export interface ScheduleData {
	cacheBust: boolean;
	id: string;
	isPaused: boolean;
	jsonParsingConfig: unknown;
	name: string | null;
	organizationId: string;
	timeout: number | null;
	url: string;
	website: { name: string | null; domain: string } | null;
	websiteId: string | null;
}

export interface CheckOptions {
	cacheBust?: boolean;
	extractHealth?: boolean;
	timeout?: number;
}

class ScheduleLookupError extends Data.TaggedError("ScheduleLookupError")<{
	message: string;
	reason: ScheduleLookupReason;
}> {}

class UptimeCheckError extends Data.TaggedError("UptimeCheckError")<{
	message: string;
}> {}

function normalizeUrl(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}
	return `https://${url}`;
}

const HEADERS: Record<string, string> = {
	"User-Agent": USER_AGENT,
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate",
	"Cache-Control": "no-cache",
	DNT: "1",
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "none",
	"Sec-Fetch-User": "?1",
	"Upgrade-Insecure-Requests": "1",
};

function applyCacheBust(url: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("_cb", Math.random().toString(36).slice(2, 10));
	return parsed.toString();
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMED_OUT_PATTERN = /timed out/;

class ResponseTooLargeError extends Error {
	constructor(limit: number) {
		super(`Response exceeded ${limit} bytes`);
	}
}

async function readBoundedBody(res: Response, limit: number): Promise<string> {
	if (!res.body) {
		return "";
	}
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let total = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => undefined);
			throw new ResponseTooLargeError(limit);
		}
		chunks.push(decoder.decode(value, { stream: true }));
	}
	chunks.push(decoder.decode());
	return chunks.join("");
}

async function pingWebsite(
	url: string,
	timeout: number,
	cacheBust: boolean
): Promise<FetchSuccess | FetchFailure> {
	const start = performance.now();
	let redirects = 0;
	let current = cacheBust ? applyCacheBust(url) : url;
	let ttfb = 0;

	try {
		while (redirects < MAX_REDIRECTS) {
			const res = await safeFetch(current, {
				method: "GET",
				headers: HEADERS,
				followRedirects: false,
				timeoutMs: timeout,
			});

			if (ttfb === 0) {
				ttfb = performance.now() - start;
			}

			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get("location");
				if (!location) {
					break;
				}
				redirects += 1;
				current = new URL(location, current).toString();
				continue;
			}

			const contentType = res.headers.get("content-type");
			const isJson = contentType?.includes("application/json");
			const contentLength = res.headers.get("content-length");
			if (
				contentLength &&
				Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES
			) {
				return {
					ok: false,
					statusCode: res.status,
					ttfb: Math.round(ttfb),
					total: Math.round(performance.now() - start),
					error: `Response too large (${contentLength} > ${MAX_RESPONSE_BYTES} bytes)`,
				};
			}
			let bodyText: string;
			try {
				bodyText = await readBoundedBody(res, MAX_RESPONSE_BYTES);
			} catch (err) {
				if (err instanceof ResponseTooLargeError) {
					return {
						ok: false,
						statusCode: res.status,
						ttfb: Math.round(ttfb),
						total: Math.round(performance.now() - start),
						error: err.message,
					};
				}
				throw err;
			}
			let parsedJson: unknown;
			let content = bodyText;
			if (isJson) {
				try {
					parsedJson = JSON.parse(bodyText);
					content = JSON.stringify(parsedJson);
				} catch {
					parsedJson = undefined;
				}
			}

			const total = performance.now() - start;

			if (res.status >= 500) {
				return {
					ok: false,
					statusCode: res.status,
					ttfb: Math.round(ttfb),
					total: Math.round(total),
					error: `HTTP ${res.status}: ${res.statusText}`,
				};
			}

			return {
				ok: true,
				statusCode: res.status,
				ttfb: Math.round(ttfb),
				total: Math.round(total),
				redirects,
				bytes: Buffer.byteLength(content, "utf8"),
				content,
				contentType,
				parsedJson,
			};
		}

		throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
	} catch (error) {
		const total = performance.now() - start;

		if (error instanceof SsrfError) {
			return {
				ok: false,
				statusCode: 0,
				ttfb: 0,
				total: Math.round(total),
				error: error.message,
			};
		}
		if (error instanceof Error && TIMED_OUT_PATTERN.test(error.message)) {
			return {
				ok: false,
				statusCode: 0,
				ttfb: 0,
				total: Math.round(total),
				error: `Timeout after ${timeout}ms`,
			};
		}

		return {
			ok: false,
			statusCode: 0,
			ttfb: 0,
			total: Math.round(total),
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

const checkCertificate = (url: string) =>
	Effect.promise<{ valid: boolean; expiry: number }>(async () => {
		const fallback = { valid: false, expiry: 0 };
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "https:") {
				return fallback;
			}

			const urlCheck = await validateUrl(url);
			if (!urlCheck.safe) {
				return fallback;
			}

			const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;

			return await new Promise<{ valid: boolean; expiry: number }>(
				(resolve) => {
					const socket = connect(
						{
							host: parsed.hostname,
							port,
							servername: parsed.hostname,
							timeout: 5000,
						},
						() => {
							const cert = socket.getPeerCertificate();
							socket.destroy();

							if (!cert?.valid_to) {
								resolve(fallback);
								return;
							}

							const expiry = new Date(cert.valid_to);
							resolve({
								valid: expiry > new Date(),
								expiry: expiry.getTime(),
							});
						}
					);

					socket.on("error", () => {
						socket.destroy();
						resolve(fallback);
					});

					socket.on("timeout", () => {
						socket.destroy();
						resolve(fallback);
					});
				}
			);
		} catch {
			return fallback;
		}
	});

let cachedProbeIp: string | null = null;

const getProbeMetadata = Effect.tryPromise({
	try: async () => {
		if (!cachedProbeIp) {
			try {
				const res = await fetch("https://api.ipify.org?format=json", {
					signal: AbortSignal.timeout(5000),
				});
				if (res.ok) {
					const data = await res.json();
					cachedProbeIp = typeof data?.ip === "string" ? data.ip : "unknown";
				}
			} catch {
				// Probe metadata is best-effort; uptime checks should continue without it.
			}
			cachedProbeIp ??= "unknown";
		}
		return { ip: cachedProbeIp, region: PROBE_REGION };
	},
	catch: () => ({ ip: "unknown", region: PROBE_REGION }),
});

const resolveSchedule = (id: string) =>
	Effect.tryPromise({
		try: () =>
			db.query.uptimeSchedules.findFirst({
				where: { id },
				with: { website: true },
			}),
		catch: (cause) =>
			new ScheduleLookupError({
				message: String(cause),
				reason: "transient",
			}),
	}).pipe(
		Effect.flatMap((schedule) => {
			if (!schedule) {
				return Effect.fail(
					new ScheduleLookupError({
						message: `Schedule ${id} not found`,
						reason: "not_found",
					})
				);
			}
			if (!schedule.url) {
				return Effect.fail(
					new ScheduleLookupError({
						message: `Schedule ${id} has invalid data (missing url)`,
						reason: "malformed",
					})
				);
			}
			return Effect.succeed({
				id: schedule.id,
				url: schedule.url,
				websiteId: schedule.websiteId,
				organizationId: schedule.organizationId,
				name: schedule.name,
				isPaused: schedule.isPaused,
				website: schedule.website
					? {
							name: schedule.website.name,
							domain: schedule.website.domain,
						}
					: null,
				jsonParsingConfig: schedule.jsonParsingConfig,
				timeout: schedule.timeout,
				cacheBust: schedule.cacheBust,
			} satisfies ScheduleData);
		})
	);

const runUptimeCheck = (
	siteId: string,
	url: string,
	attempt: number,
	options: CheckOptions
) =>
	Effect.gen(function* () {
		const normalizedUrl = normalizeUrl(url);
		const timestamp = Date.now();

		const [pingResult, probe, cert] = yield* Effect.all(
			[
				Effect.tryPromise({
					try: () =>
						pingWebsite(
							normalizedUrl,
							options.timeout ?? DEFAULT_TIMEOUT,
							options.cacheBust ?? false
						),
					catch: (cause) => new UptimeCheckError({ message: String(cause) }),
				}),
				getProbeMetadata,
				checkCertificate(normalizedUrl),
			],
			{ concurrency: "unbounded" }
		);

		const health =
			pingResult.ok && options.extractHealth
				? extractHealth(pingResult.parsedJson ?? pingResult.content)
				: null;

		return {
			site_id: siteId,
			url: normalizedUrl,
			timestamp,
			status: pingResult.ok ? MonitorStatus.UP : MonitorStatus.DOWN,
			http_code: pingResult.statusCode,
			ttfb_ms: pingResult.ttfb,
			total_ms: pingResult.total,
			attempt,
			retries: 0,
			failure_streak: 0,
			response_bytes: pingResult.ok ? pingResult.bytes : 0,
			content_hash: pingResult.ok
				? new CryptoHasher("sha256").update(pingResult.content).digest("hex")
				: "",
			redirect_count: pingResult.ok ? pingResult.redirects : 0,
			probe_region: probe.region,
			probe_ip: probe.ip,
			ssl_expiry: cert.expiry,
			ssl_valid: cert.valid ? 1 : 0,
			env: UPTIME_ENV.environment,
			check_type: "http",
			user_agent: USER_AGENT,
			error: pingResult.ok ? "" : pingResult.error,
			json_data: health ? JSON.stringify(health) : undefined,
		} satisfies UptimeData;
	});

export {
	ScheduleLookupError,
	UptimeCheckError,
	checkCertificate,
	resolveSchedule,
	runUptimeCheck,
};

export async function lookupSchedule(
	id: string
): Promise<ActionResult<ScheduleData>> {
	try {
		const data = await Effect.runPromise(resolveSchedule(id));
		return { success: true, data };
	} catch (error) {
		const reason: ScheduleLookupReason =
			error instanceof ScheduleLookupError ? error.reason : "transient";
		captureError(error, { error_step: "lookup_schedule", reason });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Database error",
			reason,
		};
	}
}

export async function checkUptime(
	siteId: string,
	url: string,
	attempt = 1,
	options: CheckOptions = {}
): Promise<ActionResult<UptimeData>> {
	try {
		const data = await Effect.runPromise(
			runUptimeCheck(siteId, url, attempt, options)
		);
		return { success: true, data };
	} catch (error) {
		captureError(error, { error_step: "check_uptime" });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Uptime check failed",
		};
	}
}

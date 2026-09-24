import { randomUUID } from "node:crypto";
import { connect } from "node:tls";
import { db } from "@databuddy/db";
import {
	safeFetch,
	SsrfError,
	validateUrl,
} from "@databuddy/shared/ssrf-guard";
import { Data, Effect } from "effect";
import { UPTIME_ENV } from "./lib/env";
import type { ScheduleLookupReason, UptimeData } from "./types";
import { MonitorStatus } from "./types";

export const DEFAULT_TIMEOUT = 60_000;
const MAX_REDIRECTS = 10;

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const PROBE_REGION =
	process.env.PROBE_REGION || process.env.RAILWAY_REPLICA_REGION || "default";

interface FetchSuccess {
	bytes: number;
	ok: true;
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
	name: string | null;
	organizationId: string;
	timeout: number | null;
	url: string;
	website: { name: string | null; domain: string } | null;
	websiteId: string | null;
}

export interface CheckOptions {
	cacheBust?: boolean;
	timeout?: number;
}

export class ScheduleLookupError extends Data.TaggedError(
	"ScheduleLookupError"
)<{
	message: string;
	reason: ScheduleLookupReason;
}> {}

export class UptimeCheckError extends Data.TaggedError("UptimeCheckError")<{
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
const TIMED_OUT_PATTERN = /tim(?:ed out|eout)/i;
const TIMEOUT_ERROR_PREFIX = "Timeout after";

export function isTimedOut(data: UptimeData): boolean {
	return data.error.startsWith(TIMEOUT_ERROR_PREFIX);
}

async function readBoundedBody(res: Response, limit: number): Promise<number> {
	if (!res.body) {
		return 0;
	}
	const reader = res.body.getReader();
	let total = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			return total;
		}
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel().catch(() => undefined);
			return total;
		}
	}
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
	const checkSignal = AbortSignal.timeout(timeout);

	try {
		while (redirects < MAX_REDIRECTS) {
			const res = await safeFetch(current, {
				method: "GET",
				headers: HEADERS,
				followRedirects: false,
				signal: checkSignal,
				timeoutMs: timeout,
			});

			if (ttfb === 0) {
				ttfb = performance.now() - start;
			}

			const location =
				res.status >= 300 && res.status < 400
					? res.headers.get("location")
					: null;
			if (location) {
				await res.body?.cancel().catch(() => undefined);
				redirects += 1;
				current = new URL(location, current).toString();
				continue;
			}

			const bytes = await readBoundedBody(res, MAX_RESPONSE_BYTES);
			const failure = (error: string): FetchFailure => ({
				ok: false,
				statusCode: res.status,
				ttfb: Math.round(ttfb),
				total: Math.round(performance.now() - start),
				error,
			});

			if (bytes > MAX_RESPONSE_BYTES) {
				return failure(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`);
			}
			if (res.status >= 400) {
				return failure(`HTTP ${res.status}: ${res.statusText}`);
			}

			return {
				ok: true,
				statusCode: res.status,
				ttfb: Math.round(ttfb),
				total: Math.round(performance.now() - start),
				redirects,
				bytes,
			};
		}

		throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
	} catch (error) {
		let message = classifyFetchError(error, timeout);
		if (checkSignal.aborted) {
			message = `${TIMEOUT_ERROR_PREFIX} ${timeout}ms`;
		} else if (error instanceof SsrfError) {
			message = error.message;
		}
		return {
			ok: false,
			statusCode: 0,
			ttfb: 0,
			total: Math.round(performance.now() - start),
			error: message,
		};
	}
}

function errorCode(error: unknown): string | undefined {
	if (!(error instanceof Error)) {
		return;
	}
	if ("code" in error && typeof error.code === "string") {
		return error.code;
	}
	return errorCode(error.cause);
}

export function classifyFetchError(error: unknown, timeout: number): string {
	if (error instanceof Error && TIMED_OUT_PATTERN.test(error.message)) {
		return `${TIMEOUT_ERROR_PREFIX} ${timeout}ms`;
	}

	const code = errorCode(error);
	switch (code) {
		case "ENOTFOUND":
		case "EAI_AGAIN":
		case "DNS_ENOTFOUND":
			return "DNS lookup failed";
		case "ECONNREFUSED":
			return "Connection refused";
		case "ECONNRESET":
			return "Connection reset by peer";
		case "EHOSTUNREACH":
		case "ENETUNREACH":
			return "Host unreachable";
		default:
			break;
	}
	if (code?.startsWith("ERR_TLS") || code?.startsWith("CERT_")) {
		return `TLS error: ${code}`;
	}

	if (error instanceof Error) {
		const cause = error.cause;
		if (
			cause instanceof Error &&
			cause.message &&
			cause.message !== error.message
		) {
			return `${error.message}: ${cause.message}`;
		}
		return error.message;
	}
	return "Unknown error";
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
			if (!(urlCheck.safe && urlCheck.ip)) {
				return fallback;
			}

			const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;

			return await new Promise<{ valid: boolean; expiry: number }>(
				(resolve) => {
					const socket = connect(
						{
							host: urlCheck.ip,
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

const PROBE_IP_FAILURE_RETRY_MS = 5 * 60_000;
let cachedProbeIp: string | null = null;
let probeIpFailedAt = Number.NEGATIVE_INFINITY;

const getProbeMetadata = Effect.promise(async () => {
	const retryFailedLookup =
		performance.now() - probeIpFailedAt > PROBE_IP_FAILURE_RETRY_MS;
	if (!cachedProbeIp && retryFailedLookup) {
		try {
			const res = await fetch("https://api.ipify.org?format=json", {
				signal: AbortSignal.timeout(5000),
			});
			if (res.ok) {
				const data = await res.json();
				if (typeof data?.ip === "string") {
					cachedProbeIp = data.ip;
				}
			}
		} catch {
			// Probe metadata is best-effort; uptime checks should continue without it.
		}
		if (!cachedProbeIp) {
			probeIpFailedAt = performance.now();
		}
	}
	return { ip: cachedProbeIp ?? "unknown", region: PROBE_REGION };
});

export const lookupSchedule = (id: string) =>
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
				timeout: schedule.timeout,
				cacheBust: schedule.cacheBust,
			} satisfies ScheduleData);
		})
	);

export const checkUptime = (
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

		const data: UptimeData = {
			site_id: siteId,
			url: normalizedUrl,
			timestamp,
			event_id: randomUUID(),
			status: pingResult.ok ? MonitorStatus.UP : MonitorStatus.DOWN,
			http_code: pingResult.statusCode,
			ttfb_ms: pingResult.ttfb,
			total_ms: pingResult.total,
			attempt,
			retries: attempt - 1,
			failure_streak: 0,
			response_bytes: pingResult.ok ? pingResult.bytes : 0,
			redirect_count: pingResult.ok ? pingResult.redirects : 0,
			probe_region: probe.region,
			probe_ip: probe.ip,
			ssl_expiry: cert.expiry,
			ssl_valid: cert.valid ? 1 : 0,
			env: UPTIME_ENV.environment,
			check_type: "http",
			user_agent: USER_AGENT,
			error: pingResult.ok ? "" : pingResult.error,
		};
		return data;
	});

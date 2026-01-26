import { createHash } from "node:crypto";
import { connect } from "node:tls";
import { db, eq, uptimeSchedules } from "@databuddy/db";
import { type JsonParsingConfig, parseJsonResponse } from "./json-parser";
import { captureError, record } from "./lib/tracing";
import type { ActionResult, UptimeData } from "./types";
import { MonitorStatus } from "./types";

const DEFAULT_TIMEOUT = 30_000;
const MAX_REDIRECTS = 10;
const MAX_RETRIES = 3;

const CONFIG = {
	userAgent:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	region:
		process.env.PROBE_REGION || process.env.RAILWAY_REPLICA_REGION || "default",
	env: process.env.NODE_ENV || "prod",
} as const;

interface FetchOptions {
	timeout?: number;
	cacheBust?: boolean;
}

interface FetchSuccess {
	ok: true;
	statusCode: number;
	ttfb: number;
	total: number;
	redirects: number;
	bytes: number;
	content: string;
	contentType: string | null;
	parsedJson?: unknown;
}

interface FetchFailure {
	ok: false;
	statusCode: number;
	ttfb: number;
	total: number;
	error: string;
}

interface ScheduleData {
	id: string;
	url: string;
	websiteId: string | null;
	jsonParsingConfig: unknown;
	timeout: number | null;
	cacheBust: boolean;
}

export function lookupSchedule(
	id: string
): Promise<ActionResult<ScheduleData>> {
	return record("uptime.lookup_schedule", async () => {
		try {
			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, id),
			});

			if (!schedule) {
				return { success: false, error: `Schedule ${id} not found` };
			}

			if (!schedule.url) {
				return {
					success: false,
					error: `Schedule ${id} has invalid data (missing url)`,
				};
			}

			return {
				success: true,
				data: {
					id: schedule.id,
					url: schedule.url,
					websiteId: schedule.websiteId,
					jsonParsingConfig: schedule.jsonParsingConfig,
					timeout: schedule.timeout,
					cacheBust: schedule.cacheBust,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Database error",
			};
		}
	});
}

function normalizeUrl(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}
	return `https://${url}`;
}

function buildHeaders(acceptEncoding: string): Record<string, string> {
	return {
		"User-Agent": CONFIG.userAgent,
		Accept:
			"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
		"Accept-Language": "en-US,en;q=0.9",
		"Accept-Encoding": acceptEncoding,
		"Cache-Control": "no-cache",
		DNT: "1",
		"Sec-Fetch-Dest": "document",
		"Sec-Fetch-Mode": "navigate",
		"Sec-Fetch-Site": "none",
		"Sec-Fetch-User": "?1",
		"Upgrade-Insecure-Requests": "1",
	};
}

function applyCacheBust(url: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("_cb", Math.random().toString(36).substring(2, 10));
	return parsed.toString();
}

async function fetchWithRedirects(
	startUrl: string,
	timeout: number,
	acceptEncoding: string,
	cacheBust: boolean
): Promise<FetchSuccess | FetchFailure> {
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), timeout);
	const start = performance.now();
	const headers = buildHeaders(acceptEncoding);

	try {
		let redirects = 0;
		let current = cacheBust ? applyCacheBust(startUrl) : startUrl;
		let ttfb = 0;

		while (redirects < MAX_REDIRECTS) {
			const res = await fetch(current, {
				method: "GET",
				signal: abort.signal,
				redirect: "manual",
				headers,
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

			let content: string;
			let parsedJson: unknown | undefined;

			if (isJson) {
				parsedJson = await res.json();
				content = JSON.stringify(parsedJson);
			} else {
				content = await res.text();
			}

			const total = performance.now() - start;
			clearTimeout(timer);

			if (!res.ok) {
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
				bytes: new Blob([content]).size,
				content,
				contentType,
				parsedJson,
			};
		}

		throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
	} catch (error) {
		clearTimeout(timer);
		const total = performance.now() - start;

		if (error instanceof Error && error.name === "AbortError") {
			return {
				ok: false,
				statusCode: 0,
				ttfb: 0,
				total: Math.round(total),
				error: `Timeout after ${timeout}ms`,
			};
		}

		throw error;
	}
}

function isEncodingFailure(message: string): boolean {
	return (
		message.includes("unexpected end") ||
		message.includes("incorrect header check") ||
		message.includes("invalid stored block") ||
		message.includes("incomplete")
	);
}

function pingWebsite(
	originalUrl: string,
	options: FetchOptions = {}
): Promise<FetchSuccess | FetchFailure> {
	return record("uptime.ping_website", async () => {
		const url = normalizeUrl(originalUrl);
		const timeout = options.timeout ?? DEFAULT_TIMEOUT;
		const cacheBust = options.cacheBust ?? false;

		try {
			const result = await fetchWithRedirects(
				url,
				timeout,
				"gzip, deflate, br",
				cacheBust
			);

			if (!result.ok && isEncodingFailure(result.error)) {
				return fetchWithRedirects(url, timeout, "gzip, deflate", cacheBust);
			}

			return result;
		} catch (error) {
			if (error instanceof Error && isEncodingFailure(error.message)) {
				try {
					return await fetchWithRedirects(
						url,
						timeout,
						"gzip, deflate",
						cacheBust
					);
				} catch {
					return {
						ok: false,
						statusCode: 0,
						ttfb: 0,
						total: 0,
						error: error.message,
					};
				}
			}

			return {
				ok: false,
				statusCode: 0,
				ttfb: 0,
				total: 0,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	});
}

function checkCertificate(url: string): Promise<{
	valid: boolean;
	expiry: number;
}> {
	return record(
		"uptime.check_certificate",
		() =>
			new Promise((resolve) => {
				try {
					const parsed = new URL(url);

					if (parsed.protocol !== "https:") {
						resolve({ valid: false, expiry: 0 });
						return;
					}

					const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;
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
								resolve({ valid: false, expiry: 0 });
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
						resolve({ valid: false, expiry: 0 });
					});

					socket.on("timeout", () => {
						socket.destroy();
						resolve({ valid: false, expiry: 0 });
					});
				} catch {
					resolve({ valid: false, expiry: 0 });
				}
			})
	);
}

function getProbeMetadata(): Promise<{ ip: string; region: string }> {
	return record("uptime.get_probe_metadata", async () => {
		try {
			const res = await fetch("https://api.ipify.org?format=json", {
				signal: AbortSignal.timeout(5000),
			});

			if (res.ok) {
				const data = (await res.json()) as { ip: string };
				return { ip: data.ip || "unknown", region: CONFIG.region };
			}
		} catch {
			// Failed to get probe IP
		}

		return { ip: "unknown", region: CONFIG.region };
	});
}

export interface CheckOptions {
	timeout?: number;
	cacheBust?: boolean;
	jsonParsingConfig?: JsonParsingConfig | null;
}

export function checkUptime(
	siteId: string,
	url: string,
	attempt = 1,
	_maxRetries: number = MAX_RETRIES,
	options: CheckOptions = {}
): Promise<ActionResult<UptimeData>> {
	return record("uptime.check_uptime", async () => {
		try {
			const normalizedUrl = normalizeUrl(url);
			const timestamp = Date.now();

			const [pingResult, probe] = await Promise.all([
				pingWebsite(normalizedUrl, {
					timeout: options.timeout,
					cacheBust: options.cacheBust,
				}),
				getProbeMetadata(),
			]);

			const status = pingResult.ok ? MonitorStatus.UP : MonitorStatus.DOWN;

			if (!pingResult.ok) {
				const cert = await checkCertificate(normalizedUrl);

				return {
					success: true,
					data: {
						site_id: siteId,
						url: normalizedUrl,
						timestamp,
						status,
						http_code: pingResult.statusCode,
						ttfb_ms: pingResult.ttfb,
						total_ms: pingResult.total,
						attempt,
						retries: 0,
						failure_streak: 0,
						response_bytes: 0,
						content_hash: "",
						redirect_count: 0,
						probe_region: probe.region,
						probe_ip: probe.ip,
						ssl_expiry: cert.expiry,
						ssl_valid: cert.valid ? 1 : 0,
						env: CONFIG.env,
						check_type: "http",
						user_agent: CONFIG.userAgent,
						error: pingResult.error,
					},
				};
			}

			const [cert, contentHash] = await Promise.all([
				checkCertificate(normalizedUrl),
				Promise.resolve(
					createHash("sha256").update(pingResult.content).digest("hex")
				),
			]);

			const jsonData = options.jsonParsingConfig
				? parseJsonResponse(
						pingResult.parsedJson ?? pingResult.content,
						pingResult.contentType,
						options.jsonParsingConfig
					)
				: null;

			return {
				success: true,
				data: {
					site_id: siteId,
					url: normalizedUrl,
					timestamp,
					status,
					http_code: pingResult.statusCode,
					ttfb_ms: pingResult.ttfb,
					total_ms: pingResult.total,
					attempt,
					retries: 0,
					failure_streak: 0,
					response_bytes: pingResult.bytes,
					content_hash: contentHash,
					redirect_count: pingResult.redirects,
					probe_region: probe.region,
					probe_ip: probe.ip,
					ssl_expiry: cert.expiry,
					ssl_valid: cert.valid ? 1 : 0,
					env: CONFIG.env,
					check_type: "http",
					user_agent: CONFIG.userAgent,
					error: "",
					json_data: jsonData ? JSON.stringify(jsonData) : undefined,
				},
			};
		} catch (error) {
			captureError(error);

			return {
				success: false,
				error: error instanceof Error ? error.message : "Uptime check failed",
			};
		}
	});
}

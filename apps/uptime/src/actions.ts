import { createHash } from "node:crypto";
import { connect } from "node:tls";
import { db, eq } from "@databuddy/db";
import { uptimeSchedules } from "@databuddy/db/schema";
import { validateUrl } from "@databuddy/shared/ssrf-guard";
import { extractHealth, isHealthExtractionEnabled } from "./json-parser";
import { captureError, mergeWideEvent } from "./lib/tracing";
import type { ActionResult, UptimeData } from "./types";
import { MonitorStatus } from "./types";

const DEFAULT_TIMEOUT = 60_000;
const MAX_REDIRECTS = 10;

const CONFIG = {
	userAgent:
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	region:
		process.env.PROBE_REGION || process.env.RAILWAY_REPLICA_REGION || "default",
	env: process.env.NODE_ENV || "prod",
} as const;

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
	jsonParsingConfig: unknown;
	name: string | null;
	organizationId: string;
	timeout: number | null;
	url: string;
	website: { name: string | null; domain: string } | null;
	websiteId: string | null;
}

function mergeUptimeCheckMetrics(data: UptimeData): void {
	mergeWideEvent({
		monitor_status: data.status,
		http_code: data.http_code,
		total_ms: data.total_ms,
		ttfb_ms: data.ttfb_ms,
		probe_region: data.probe_region,
		ssl_valid: data.ssl_valid === 1,
		response_bytes: data.response_bytes,
		redirect_count: data.redirect_count,
	});
}

export async function lookupSchedule(
	id: string
): Promise<ActionResult<ScheduleData>> {
	try {
		const schedule = await db.query.uptimeSchedules.findFirst({
			where: eq(uptimeSchedules.id, id),
			with: { website: true },
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

		mergeWideEvent({
			db_schedule_loaded: true,
			schedule_cache_bust: schedule.cacheBust,
			schedule_timeout_ms: schedule.timeout ?? 0,
			json_parsing_enabled: isHealthExtractionEnabled(
				schedule.jsonParsingConfig
			),
		});

		return {
			success: true,
			data: {
				id: schedule.id,
				url: schedule.url,
				websiteId: schedule.websiteId,
				organizationId: schedule.organizationId,
				name: schedule.name,
				website: schedule.website
					? {
							name: schedule.website.name,
							domain: schedule.website.domain,
						}
					: null,
				jsonParsingConfig: schedule.jsonParsingConfig,
				timeout: schedule.timeout,
				cacheBust: schedule.cacheBust,
			},
		};
	} catch (error) {
		captureError(error, { error_step: "lookup_schedule" });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Database error",
		};
	}
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
	parsed.searchParams.set("_cb", Math.random().toString(36).slice(2, 10));
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
			const urlCheck = await validateUrl(current);
			if (!urlCheck.safe) {
				return {
					ok: false as const,
					statusCode: 0,
					ttfb: 0,
					total: Math.round(performance.now() - start),
					error: urlCheck.error ?? "Target resolves to a private address",
				};
			}

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

async function pingWebsite(
	originalUrl: string,
	options: { cacheBust?: boolean; timeout?: number } = {}
): Promise<FetchSuccess | FetchFailure> {
	const url = normalizeUrl(originalUrl);
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	const cacheBust = options.cacheBust ?? false;

	try {
		return await fetchWithRedirects(url, timeout, "gzip, deflate", cacheBust);
	} catch (error) {
		return {
			ok: false as const,
			statusCode: 0,
			ttfb: 0,
			total: 0,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

function checkCertificate(url: string): Promise<{
	valid: boolean;
	expiry: number;
}> {
	return new Promise((resolve) => {
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
	});
}

async function getProbeMetadata(): Promise<{ ip: string; region: string }> {
	try {
		const res = await fetch("https://api.ipify.org?format=json", {
			signal: AbortSignal.timeout(5000),
		});

		if (res.ok) {
			const data = await res.json();
			return {
				ip: typeof data?.ip === "string" ? data.ip : "unknown",
				region: CONFIG.region,
			};
		}
	} catch {
		// Failed to get probe IP
	}

	return { ip: "unknown", region: CONFIG.region };
}

export interface CheckOptions {
	cacheBust?: boolean;
	extractHealth?: boolean;
	timeout?: number;
}

export async function checkUptime(
	siteId: string,
	url: string,
	attempt = 1,
	_maxRetries = 3,
	options: CheckOptions = {}
): Promise<ActionResult<UptimeData>> {
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
		const cert = await checkCertificate(normalizedUrl);

		let contentHash = "";
		let responseBytes = 0;
		let redirectCount = 0;
		let error = "";
		let jsonDataStr: string | undefined;

		if (pingResult.ok) {
			contentHash = createHash("sha256")
				.update(pingResult.content)
				.digest("hex");
			responseBytes = pingResult.bytes;
			redirectCount = pingResult.redirects;
			if (options.extractHealth) {
				const health = extractHealth(
					pingResult.parsedJson ?? pingResult.content
				);
				jsonDataStr = health ? JSON.stringify(health) : undefined;
			}
		} else {
			error = pingResult.error;
		}

		const data: UptimeData = {
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
			response_bytes: responseBytes,
			content_hash: contentHash,
			redirect_count: redirectCount,
			probe_region: probe.region,
			probe_ip: probe.ip,
			ssl_expiry: cert.expiry,
			ssl_valid: cert.valid ? 1 : 0,
			env: CONFIG.env,
			check_type: "http",
			user_agent: CONFIG.userAgent,
			error,
			json_data: jsonDataStr,
		};
		mergeUptimeCheckMetrics(data);
		return { success: true, data };
	} catch (error) {
		captureError(error, { error_step: "check_uptime" });

		return {
			success: false,
			error: error instanceof Error ? error.message : "Uptime check failed",
		};
	}
}

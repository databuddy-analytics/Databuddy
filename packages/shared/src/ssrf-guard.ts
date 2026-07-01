import { isValid, parse } from "ipaddr.js";
import { resolve4, resolve6 } from "node:dns/promises";
import type { Agent, RequestInit as UndiciRequestInit } from "undici";

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"metadata.google.internal",
	"metadata.google",
	"169.254.169.254",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost"];

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

function isPrivateOrReserved(ip: string): boolean {
	try {
		let parsed = parse(ip);
		if (parsed.kind() === "ipv6") {
			const ipv6 = parsed as Extract<
				ReturnType<typeof parse>,
				{ kind(): "ipv6" }
			>;
			if (ipv6.isIPv4MappedAddress()) {
				parsed = ipv6.toIPv4Address();
			}
		}
		return parsed.range() !== "unicast";
	} catch {
		return true;
	}
}

export interface UrlValidation {
	error?: string;
	hostname: string;
	ip?: string;
	safe: boolean;
}

async function resolveFirstPublicIp(
	hostname: string
): Promise<{ ip: string } | { error: string }> {
	const [v4, v6] = await Promise.all([
		resolve4(hostname).catch(() => [] as string[]),
		resolve6(hostname).catch(() => [] as string[]),
	]);
	const all = [...v4, ...v6];
	if (all.length === 0) {
		return { error: "DNS resolution failed" };
	}
	for (const ip of all) {
		if (isPrivateOrReserved(ip)) {
			return { error: `Resolves to private IP: ${ip}` };
		}
	}
	return { ip: all[0] };
}

export async function validateUrl(url: string): Promise<UrlValidation> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { safe: false, hostname: "", error: "Invalid URL" };
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		return {
			safe: false,
			hostname: parsed.hostname,
			error: "Invalid protocol",
		};
	}

	const hostname = parsed.hostname.toLowerCase();

	if (BLOCKED_HOSTNAMES.has(hostname)) {
		return { safe: false, hostname, error: "Blocked hostname" };
	}

	for (const suffix of BLOCKED_SUFFIXES) {
		if (hostname.endsWith(suffix)) {
			return { safe: false, hostname, error: "Blocked hostname suffix" };
		}
	}

	if (isValid(hostname)) {
		if (isPrivateOrReserved(hostname)) {
			return { safe: false, hostname, error: "Private IP address" };
		}
		return { safe: true, hostname, ip: hostname };
	}

	const resolved = await resolveFirstPublicIp(hostname);
	if ("error" in resolved) {
		return { safe: false, hostname, error: resolved.error };
	}
	return { safe: true, hostname, ip: resolved.ip };
}

export class SsrfError extends Error {
	readonly hostname?: string;
	constructor(message: string, hostname?: string) {
		super(message);
		this.name = "SsrfError";
		this.hostname = hostname;
	}
}

export interface SafeFetchInit
	extends Omit<UndiciRequestInit, "redirect" | "signal" | "dispatcher"> {
	followRedirects?: boolean;
	maxRedirects?: number;
	signal?: AbortSignal | null;
	timeoutMs?: number;
}

function pinnedAgent(
	AgentCtor: typeof import("undici").Agent,
	hostname: string,
	ip: string
): Agent {
	return new AgentCtor({
		connect: {
			lookup: (host, _options, cb) => {
				if (host.toLowerCase() !== hostname) {
					cb(new Error(`Unexpected lookup for ${host}`), "", 0);
					return;
				}
				cb(null, ip, ip.includes(":") ? 6 : 4);
			},
		},
	});
}

export async function safeFetch(
	url: string,
	init: SafeFetchInit = {}
): Promise<Response> {
	const {
		followRedirects = true,
		maxRedirects = DEFAULT_MAX_REDIRECTS,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		signal: externalSignal,
		...fetchInit
	} = init;

	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	const signal = externalSignal
		? AbortSignal.any([timeoutSignal, externalSignal])
		: timeoutSignal;

	const { Agent: UndiciAgent, fetch: undiciFetch } = await import("undici");
	let current = url;

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const check = await validateUrl(current);
		if (!(check.safe && check.ip)) {
			throw new SsrfError(
				check.error ?? "URL failed SSRF validation",
				check.hostname
			);
		}

		const dispatcher = pinnedAgent(UndiciAgent, check.hostname, check.ip);
		let response: Response;
		try {
			response = (await undiciFetch(current, {
				...fetchInit,
				redirect: "manual",
				signal,
				dispatcher,
			})) as unknown as Response;
		} catch (error) {
			if (timeoutSignal.aborted) {
				throw new Error(`Request timed out after ${timeoutMs}ms`);
			}
			throw error;
		}

		if (!followRedirects || response.status < 300 || response.status >= 400) {
			return response;
		}

		const location = response.headers.get("location");
		if (!location) {
			return response;
		}

		try {
			current = new URL(location, current).toString();
		} catch {
			throw new SsrfError(`Invalid redirect target: ${location}`);
		}
	}

	throw new SsrfError(`Too many redirects (>${maxRedirects})`);
}

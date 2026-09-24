import { isValid, parse } from "ipaddr.js";
import { Resolver } from "node:dns/promises";
import type { RequestInit as UndiciRequestInit } from "undici";

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"metadata.google.internal",
	"metadata.google",
	"169.254.169.254",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost"];

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DNS_TIMEOUT_MS = 5000;

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
	hostname: string,
	signal: AbortSignal
): Promise<{ ip: string } | { error: string }> {
	if (signal.aborted) {
		return { error: "DNS resolution timed out" };
	}
	const resolver = new Resolver();
	const cancel = () => resolver.cancel();
	signal.addEventListener("abort", cancel, { once: true });
	let v4: string[];
	let v6: string[];
	try {
		[v4, v6] = await Promise.all([
			resolver.resolve4(hostname).catch(() => [] as string[]),
			resolver.resolve6(hostname).catch(() => [] as string[]),
		]);
	} finally {
		signal.removeEventListener("abort", cancel);
	}
	if (signal.aborted) {
		return { error: "DNS resolution timed out" };
	}
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

export interface UrlValidationOptions {
	dnsTimeoutMs?: number;
	signal?: AbortSignal | null;
}

export async function validateUrl(
	url: string,
	options: UrlValidationOptions = {}
): Promise<UrlValidation> {
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

	const rawHostname = parsed.hostname.toLowerCase();
	const hostname =
		rawHostname.startsWith("[") && rawHostname.endsWith("]")
			? rawHostname.slice(1, -1)
			: rawHostname;

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

	const dnsTimeoutSignal = AbortSignal.timeout(
		options.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS
	);
	const signal = options.signal
		? AbortSignal.any([dnsTimeoutSignal, options.signal])
		: dnsTimeoutSignal;
	const resolved = await resolveFirstPublicIp(hostname, signal);
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

type PinnedFetchInit = Omit<SafeFetchInit, keyof SafeFetchOptions> & {
	redirect: "manual";
	signal: AbortSignal;
};

type SafeFetchOptions = Pick<
	SafeFetchInit,
	"followRedirects" | "maxRedirects" | "signal" | "timeoutMs"
>;

function fetchPinnedWithBun(
	url: string,
	ip: string,
	init: PinnedFetchInit
): Promise<Response> {
	const target = new URL(url);
	const headers = new Headers(init.headers as HeadersInit | undefined);
	headers.set("Host", target.host);
	const serverName = target.hostname;
	target.hostname = ip.includes(":") ? `[${ip}]` : ip;
	return fetch(target, {
		...(init as RequestInit),
		headers,
		tls: { serverName },
	} as RequestInit);
}

async function fetchPinnedWithUndici(
	url: string,
	hostname: string,
	ip: string,
	init: PinnedFetchInit
): Promise<Response> {
	const { Agent: UndiciAgent, fetch: undiciFetch } = await import("undici");
	const dispatcher = new UndiciAgent({
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
	try {
		return (await undiciFetch(url, {
			...init,
			dispatcher,
		})) as unknown as Response;
	} finally {
		dispatcher.close().catch(() => undefined);
	}
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

	let current = url;

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const check = await validateUrl(current, { signal });
		if (!(check.safe && check.ip)) {
			throw new SsrfError(
				check.error ?? "URL failed SSRF validation",
				check.hostname
			);
		}

		const pinnedInit: PinnedFetchInit = {
			...fetchInit,
			redirect: "manual",
			signal,
		};
		let response: Response;
		try {
			response = process.versions.bun
				? await fetchPinnedWithBun(current, check.ip, pinnedInit)
				: await fetchPinnedWithUndici(
						current,
						check.hostname,
						check.ip,
						pinnedInit
					);
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
		await response.body?.cancel().catch(() => undefined);

		try {
			current = new URL(location, current).toString();
		} catch {
			throw new SsrfError(`Invalid redirect target: ${location}`);
		}
	}

	throw new SsrfError(`Too many redirects (>${maxRedirects})`);
}

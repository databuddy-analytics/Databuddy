import { describe, expect, it } from "bun:test";
import { redirectInit, safeFetch, validateUrl } from "./ssrf-guard";

describe("validateUrl", () => {
	it.each([
		["not a url"],
		[""],
		["http://"],
	])("rejects invalid URL %j", async (url) => {
		expect((await validateUrl(url)).safe).toBe(false);
	});

	it.each([
		["ftp://example.com"],
		["file:///etc/passwd"],
		["javascript:alert(1)"],
	])("rejects non-http(s) protocol %j", async (url) => {
		expect((await validateUrl(url)).safe).toBe(false);
	});

	it.each([
		["http://localhost"],
		["http://LOCALHOST"],
		["http://169.254.169.254/"],
		["http://metadata.google.internal"],
	])("rejects blocked hostname %j", async (url) => {
		expect((await validateUrl(url)).safe).toBe(false);
	});

	it.each([
		["http://printer.local"],
		["http://service.internal"],
		["http://app.localhost"],
	])("rejects blocked suffix %j", async (url) => {
		expect((await validateUrl(url)).safe).toBe(false);
	});

	it.each([
		["loopback", "http://127.0.0.1"],
		["10/8", "http://10.0.0.1"],
		["172.16/12 lower bound", "http://172.16.0.1"],
		["172.16/12 upper bound", "http://172.31.255.254"],
		["192.168/16", "http://192.168.1.1"],
		["link-local", "http://169.254.0.1"],
		["IPv6 loopback", "http://[::1]"],
		["IPv4-mapped private IPv6", "http://[::ffff:192.168.1.1]"],
		["IPv4-mapped loopback IPv6", "http://[::ffff:127.0.0.1]"],
		["IPv6 unique local", "http://[fd00::1]"],
	])("rejects private or reserved IP literal (%s)", async (_label, url) => {
		const result = await validateUrl(url);
		expect(result.safe).toBe(false);
		expect(result.error).toBe("Private IP address");
	});

	it.each([
		["public IPv4", "http://8.8.8.8", "8.8.8.8"],
		["first address past 172.16/12", "http://172.32.0.1", "172.32.0.1"],
		["public IPv6", "http://[2001:4860:4860::8888]", "2001:4860:4860::8888"],
	])("returns the validated IP for %s", async (_label, url, ip) => {
		const result = await validateUrl(url);
		expect(result.safe).toBe(true);
		expect(result.ip).toBe(ip);
	});

	it("cancels DNS validation when the request deadline has elapsed", async () => {
		const controller = new AbortController();
		controller.abort(new Error("request deadline elapsed"));

		const startedAt = performance.now();
		const result = await validateUrl("https://example.com", {
			signal: controller.signal,
		});

		expect(result).toMatchObject({
			error: "DNS resolution timed out",
			hostname: "example.com",
			safe: false,
		});
		expect(performance.now() - startedAt).toBeLessThan(100);
	});
});

describe("redirectInit", () => {
	const init = {
		method: "POST",
		body: "{}",
		headers: {
			Authorization: "Bearer secret",
			"X-Webhook-Secret": "s3cret",
			"Content-Type": "application/json",
		},
	};

	it("drops credential headers when the redirect leaves the origin", () => {
		const next = redirectInit(
			init,
			307,
			"https://a.example/hook",
			new URL("https://b.example/hook")
		);
		expect(next.headers).toEqual({ "content-type": "application/json" });
		expect(next.method).toBe("POST");
		expect(next.body).toBe("{}");
	});

	it("keeps accept-encoding across origins so identity requests stay uncompressed", () => {
		const next = redirectInit(
			{ headers: { "accept-encoding": "identity", Cookie: "a=b" } },
			301,
			"https://www.a.example/robots.txt",
			new URL("https://a.example/robots.txt")
		);
		expect(next.headers).toEqual({ "accept-encoding": "identity" });
	});

	it("keeps headers on a same-origin redirect", () => {
		const next = redirectInit(
			init,
			307,
			"https://a.example/hook",
			new URL("https://a.example/other")
		);
		expect(next.headers).toBe(init.headers);
	});

	it.each([
		301, 302, 303,
	])("turns a %i redirect of a POST into a body-less GET", (status) => {
		const next = redirectInit(
			init,
			status,
			"https://a.example/hook",
			new URL("https://a.example/other")
		);
		expect(next.method).toBe("GET");
		expect(next.body).toBeUndefined();
		expect(next.headers).toEqual({
			authorization: "Bearer secret",
			"x-webhook-secret": "s3cret",
		});
	});
});

describe("safeFetch", () => {
	it("re-issues a cross-origin 302 of a POST as a credential-less GET", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (
			input: URL | RequestInfo,
			init?: RequestInit
		) => {
			calls.push({ url: String(input), init: init ?? {} });
			if (calls.length === 1) {
				return Response.redirect("http://8.8.8.8/hook", 302);
			}
			return new Response("ok", { status: 200 });
		}) as typeof fetch;
		try {
			const response = await safeFetch("http://1.1.1.1/hook", {
				method: "POST",
				body: "{}",
				headers: {
					Authorization: "Bearer secret",
					"Content-Type": "application/json",
					"Accept-Encoding": "identity",
				},
			});
			expect(response.status).toBe(200);
		} finally {
			globalThis.fetch = originalFetch;
		}
		expect(calls).toHaveLength(2);
		const second = calls[1];
		if (!second) {
			throw new Error("missing redirected request");
		}
		expect(second.url).toBe("http://8.8.8.8/hook");
		expect(second.init.method).toBe("GET");
		expect(second.init.body).toBeUndefined();
		const headers = new Headers(second.init.headers);
		expect(headers.has("authorization")).toBe(false);
		expect(headers.has("content-type")).toBe(false);
		expect(headers.get("accept-encoding")).toBe("identity");
	});
});

import { describe, expect, it } from "bun:test";
import { validateUrl } from "./ssrf-guard";

describe("validateUrl", () => {
	it.each([["not a url"], [""], ["http://"]])(
		"rejects invalid URL %j",
		async (url) => {
			expect((await validateUrl(url)).safe).toBe(false);
		}
	);

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

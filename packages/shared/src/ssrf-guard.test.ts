import { describe, expect, it } from "bun:test";
import { validateUrl } from "./ssrf-guard";

describe("validateUrl", () => {
	it("rejects invalid URLs", async () => {
		expect((await validateUrl("not a url")).safe).toBe(false);
		expect((await validateUrl("")).safe).toBe(false);
	});

	it("rejects non-http(s) protocols", async () => {
		expect((await validateUrl("ftp://example.com")).safe).toBe(false);
		expect((await validateUrl("file:///etc/passwd")).safe).toBe(false);
		expect((await validateUrl("javascript:alert(1)")).safe).toBe(false);
	});

	it("rejects blocked hostnames", async () => {
		expect((await validateUrl("http://localhost")).safe).toBe(false);
		expect((await validateUrl("http://169.254.169.254/")).safe).toBe(false);
		expect((await validateUrl("http://metadata.google.internal")).safe).toBe(
			false
		);
	});

	it("rejects blocked suffixes", async () => {
		expect((await validateUrl("http://printer.local")).safe).toBe(false);
		expect((await validateUrl("http://service.internal")).safe).toBe(false);
	});

	it("rejects private IP literals", async () => {
		expect((await validateUrl("http://10.0.0.1")).safe).toBe(false);
		expect((await validateUrl("http://192.168.1.1")).safe).toBe(false);
		expect((await validateUrl("http://172.16.0.1")).safe).toBe(false);
		expect((await validateUrl("http://127.0.0.1")).safe).toBe(false);
	});

	it("returns the validated IP for an IP-literal URL", async () => {
		const result = await validateUrl("http://8.8.8.8");
		expect(result.safe).toBe(true);
		expect(result.ip).toBe("8.8.8.8");
	});

	it("returns a public IP for a public hostname", async () => {
		const result = await validateUrl("https://example.com");
		expect(result.safe).toBe(true);
		expect(typeof result.ip).toBe("string");
		expect(result.ip).not.toMatch(/^(10\.|192\.168\.|172\.16\.|127\.)/);
	});
});

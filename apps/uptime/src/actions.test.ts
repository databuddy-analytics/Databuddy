import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { checkCertificate, classifyFetchError } from "./actions";

describe("checkCertificate", () => {
	it("runs on the installed Effect runtime for non-HTTPS URLs", async () => {
		await expect(
			Effect.runPromise(checkCertificate("http://example.com"))
		).resolves.toEqual({
			valid: false,
			expiry: 0,
		});
	});
});

describe("classifyFetchError", () => {
	function withCode(message: string, code: string): Error {
		const error = new Error(message) as NodeJS.ErrnoException;
		error.code = code;
		return error;
	}

	it("classifies timeouts with the configured budget", () => {
		expect(classifyFetchError(new Error("The operation timed out"), 5000)).toBe(
			"Timeout after 5000ms"
		);
	});

	it("classifies DNS and connection failures by code", () => {
		expect(classifyFetchError(withCode("fetch failed", "ENOTFOUND"), 5000)).toBe(
			"DNS lookup failed"
		);
		expect(
			classifyFetchError(withCode("fetch failed", "ECONNREFUSED"), 5000)
		).toBe("Connection refused");
		expect(
			classifyFetchError(withCode("fetch failed", "ECONNRESET"), 5000)
		).toBe("Connection reset by peer");
	});

	it("reads codes from the error cause chain", () => {
		const cause = withCode("getaddrinfo ENOTFOUND example.invalid", "EAI_AGAIN");
		const wrapped = new Error("fetch failed", { cause });
		expect(classifyFetchError(wrapped, 5000)).toBe("DNS lookup failed");
	});

	it("surfaces TLS error codes", () => {
		expect(
			classifyFetchError(
				withCode("certificate has expired", "CERT_HAS_EXPIRED"),
				5000
			)
		).toBe("TLS error: CERT_HAS_EXPIRED");
	});

	it("falls back to the message with cause context", () => {
		const wrapped = new Error("fetch failed", {
			cause: new Error("socket hang up"),
		});
		expect(classifyFetchError(wrapped, 5000)).toBe(
			"fetch failed: socket hang up"
		);
		expect(classifyFetchError("weird", 5000)).toBe("Unknown error");
	});
});

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { checkCertificate } from "./actions";

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

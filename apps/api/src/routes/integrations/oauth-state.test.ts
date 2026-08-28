import { describe, expect, it } from "vitest";
import {
	createOAuthState,
	type OAuthState,
	verifyOAuthState,
} from "./oauth-state";

const SECRET = "test-secret-with-enough-entropy";
const NOW = 1_800_000_000_000;

function makeState(overrides: Partial<OAuthState> = {}): OAuthState {
	return {
		expiresAt: NOW + 60_000,
		nonce: "state-nonce",
		organizationId: "org_123",
		userId: "user_123",
		...overrides,
	};
}

describe("Slack OAuth state", () => {
	it("round-trips a signed state payload", () => {
		const state = makeState();
		const encoded = createOAuthState(state, SECRET);

		expect(verifyOAuthState(encoded, SECRET, NOW)).toEqual(state);
	});

	it("rejects tampered payloads", () => {
		const encoded = createOAuthState(makeState(), SECRET);
		const [payload, signature] = encoded.split(".");
		const tamperedPayload =
			payload === "a" ? "b" : `a${payload?.slice(1) ?? ""}`;
		const tampered = `${tamperedPayload}.${signature}`;

		expect(verifyOAuthState(tampered, SECRET, NOW)).toBeNull();
	});

	it("rejects expired state", () => {
		const encoded = createOAuthState(
			makeState({ expiresAt: NOW - 1 }),
			SECRET
		);

		expect(verifyOAuthState(encoded, SECRET, NOW)).toBeNull();
	});
});

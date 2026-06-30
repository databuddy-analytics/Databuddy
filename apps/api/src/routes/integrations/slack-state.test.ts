import { describe, expect, it } from "vitest";
import {
	createSlackOAuthState,
	type SlackOAuthState,
	verifySlackOAuthState,
} from "./slack-state";

const SECRET = "test-secret-with-enough-entropy";
const NOW = 1_800_000_000_000;

function makeState(overrides: Partial<SlackOAuthState> = {}): SlackOAuthState {
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
		const encoded = createSlackOAuthState(state, SECRET);

		expect(verifySlackOAuthState(encoded, SECRET, NOW)).toEqual(state);
	});

	it("rejects tampered payloads", () => {
		const encoded = createSlackOAuthState(makeState(), SECRET);
		const [payload, signature] = encoded.split(".");
		const tamperedPayload =
			payload === "a" ? "b" : `a${payload?.slice(1) ?? ""}`;
		const tampered = `${tamperedPayload}.${signature}`;

		expect(verifySlackOAuthState(tampered, SECRET, NOW)).toBeNull();
	});

	it("rejects expired state", () => {
		const encoded = createSlackOAuthState(
			makeState({ expiresAt: NOW - 1 }),
			SECRET
		);

		expect(verifySlackOAuthState(encoded, SECRET, NOW)).toBeNull();
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	getSession: vi.fn(),
	resolveApiKey: vi.fn(),
}));

vi.mock("@databuddy/auth", () => ({
	auth: { api: { getSession: state.getSession } },
}));
vi.mock("@databuddy/api-keys/resolve", () => ({
	isApiKeyPresent: (headers: Headers) => Boolean(headers.get("x-api-key")),
	resolveApiKey: state.resolveApiKey,
}));
vi.mock("@databuddy/ai/lib/tracing", () => ({ mergeWideEvent: () => {} }));

const { applyAuthWideEvent, resolveRequestAuth } = await import(
	"./auth-wide-event"
);
const key = {
	id: "key-synthetic",
	organizationId: "org-key-synthetic",
	prefix: "test",
	type: "user",
	scopes: ["read:data"],
};
const session = {
	user: { id: "user-synthetic", email: "synthetic@example.invalid" },
	session: { activeOrganizationId: "org-session-synthetic" },
};

beforeEach(() => {
	state.getSession.mockReset().mockResolvedValue(session);
	state.resolveApiKey.mockReset().mockResolvedValue({ key, outcome: "ok" });
});

describe("independent auth resolution", () => {
	it("keeps a valid API key when uncached session resolution fails", async () => {
		state.getSession.mockRejectedValueOnce(
			new Error("Synthetic session-store outage")
		);
		const headers = new Headers({ "x-api-key": "dbdy_inert_valid" });
		await expect(resolveRequestAuth(headers)).resolves.toEqual({
			apiKey: key,
			session: null,
		});
		expect(state.resolveApiKey).toHaveBeenCalledExactlyOnceWith(headers);
	});

	it("returns no identity when session resolution fails without a key", async () => {
		state.getSession.mockRejectedValueOnce(
			new Error("Synthetic session-store outage")
		);
		await expect(resolveRequestAuth(new Headers())).resolves.toEqual({
			apiKey: null,
			session: null,
		});
		expect(state.resolveApiKey).not.toHaveBeenCalled();
	});

	it("preserves both successful identities for caller selection", async () => {
		await expect(
			resolveRequestAuth(new Headers({ "x-api-key": "dbdy_inert_valid" }))
		).resolves.toEqual({ apiKey: key, session });
	});

	it("propagates an API-key resolver failure", async () => {
		const failure = new Error("Synthetic key-store outage");
		state.resolveApiKey.mockRejectedValueOnce(failure);
		await expect(
			resolveRequestAuth(new Headers({ "x-api-key": "dbdy_inert_valid" }))
		).rejects.toBe(failure);
	});

	it("reuses telemetry-resolved key auth without another session lookup", async () => {
		state.getSession.mockRejectedValueOnce(
			new Error("Synthetic session-store outage")
		);
		const headers = new Headers({ "x-api-key": "dbdy_inert_valid" });
		await applyAuthWideEvent(headers);
		await expect(resolveRequestAuth(headers)).resolves.toEqual({
			apiKey: key,
			session: null,
		});
		expect(state.getSession).toHaveBeenCalledTimes(1);
		expect(state.resolveApiKey).toHaveBeenCalledTimes(1);
	});
});

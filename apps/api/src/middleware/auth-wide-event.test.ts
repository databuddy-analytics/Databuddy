import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-wide-event", () => ({
	applyAuthWideEvent: vi.fn(),
}));

import {
	enrichRequestAuthWideEvent,
	shouldResolveAuthForWideEvent,
} from "./auth-wide-event";

describe("auth wide-event admission", () => {
	it("maps API-key dependency failures to a retryable 503 without exposing the key", async () => {
		const secret = "dbdy_sensitive_test_key";
		const applyAuth = vi
			.fn()
			.mockRejectedValue(new Error(`database timeout while resolving ${secret}`));
		const request = new Request("https://api.example.com/links/create", {
			headers: { "x-api-key": secret },
			method: "POST",
		});

		const response = await enrichRequestAuthWideEvent(request, applyAuth);

		expect(response?.status).toBe(503);
		expect(response?.headers.get("retry-after")).toBe("5");
		const body = await response?.text();
		expect(body).toContain('"code":"SERVICE_UNAVAILABLE"');
		expect(body).not.toContain(secret);
	});

	it("does not reinterpret failures on requests without an API key", async () => {
		const dependencyError = new Error("session telemetry failed");
		const request = new Request("https://api.example.com/links/create", {
			method: "POST",
		});

		await expect(
			enrichRequestAuthWideEvent(request, async () => {
				throw dependencyError;
			})
		).rejects.toBe(dependencyError);
	});

	it("resolves auth for HEAD while allowing only OPTIONS to bypass", () => {
		expect(
			shouldResolveAuthForWideEvent(
				new Request("https://api.example.com/links/create", {
					method: "HEAD",
				})
			)
		).toBe(true);
		expect(
			shouldResolveAuthForWideEvent(
				new Request("https://api.example.com/links/create", {
					method: "OPTIONS",
				})
			)
		).toBe(false);
	});
});

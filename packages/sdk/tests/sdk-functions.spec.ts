import { expect, test } from "@playwright/test";
import { waitForSDK } from "./test-utils";

test.describe("SDK Functions", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test");
		await waitForSDK(page);
		await page.evaluate(() => {
			localStorage.clear();
			sessionStorage.clear();
		});
	});

	test.describe("isTrackerAvailable", () => {
		test("returns false when tracker is not loaded", async ({ page }) => {
			const available = await page.evaluate(() =>
				window.__SDK__.isTrackerAvailable()
			);
			expect(available).toBe(false);
		});

		test("returns true when window.databuddy exists", async ({ page }) => {
			const available = await page.evaluate(() => {
				(window as any).databuddy = {
					track: () => {},
					screenView: () => {},
					setGlobalProperties: () => {},
					clear: () => {},
					flush: () => {},
					options: {},
				};
				return window.__SDK__.isTrackerAvailable();
			});
			expect(available).toBe(true);
		});

		test("returns true when window.db exists", async ({ page }) => {
			const available = await page.evaluate(() => {
				(window as any).db = {
					track: () => {},
					screenView: () => {},
					setGlobalProperties: () => {},
					clear: () => {},
					flush: () => {},
				};
				return window.__SDK__.isTrackerAvailable();
			});
			expect(available).toBe(true);
		});
	});

	test.describe("track", () => {
		test("calls window.databuddy.track with name and properties", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				let capturedName = "";
				let capturedProps: Record<string, unknown> = {};

				(window as any).databuddy = {
					track: (name: string, props: Record<string, unknown>) => {
						capturedName = name;
						capturedProps = props;
					},
					options: {},
				};

				window.__SDK__.track("test_event", { key: "value" });
				return { capturedName, capturedProps };
			});

			expect(result.capturedName).toBe("test_event");
			expect(result.capturedProps).toEqual({ key: "value" });
		});

		test("is a no-op when tracker is not loaded", async ({ page }) => {
			const errored = await page.evaluate(() => {
				try {
					window.__SDK__.track("test_event", { key: "value" });
					return false;
				} catch {
					return true;
				}
			});
			expect(errored).toBe(false);
		});

		test("delegates to window.db.track when available", async ({ page }) => {
			const result = await page.evaluate(() => {
				let called = false;
				(window as any).db = {
					track: () => {
						called = true;
					},
				};
				window.__SDK__.track("event");
				return called;
			});
			expect(result).toBe(true);
		});
	});

	test.describe("trackError", () => {
		test("sends error event via track", async ({ page }) => {
			const result = await page.evaluate(() => {
				let capturedName = "";
				let capturedProps: Record<string, unknown> = {};

				(window as any).databuddy = {
					track: (name: string, props: Record<string, unknown>) => {
						capturedName = name;
						capturedProps = props;
					},
					options: {},
				};

				window.__SDK__.trackError("Something broke", {
					filename: "app.js",
					lineno: 42,
					error_type: "TypeError",
				});

				return { capturedName, capturedProps };
			});

			expect(result.capturedName).toBe("error");
			expect(result.capturedProps.message).toBe("Something broke");
			expect(result.capturedProps.filename).toBe("app.js");
			expect(result.capturedProps.lineno).toBe(42);
			expect(result.capturedProps.error_type).toBe("TypeError");
		});
	});

	test.describe("clear", () => {
		test("calls window.databuddy.clear", async ({ page }) => {
			const result = await page.evaluate(() => {
				let called = false;
				(window as any).databuddy = {
					clear: () => {
						called = true;
					},
					options: {},
				};
				window.__SDK__.clear();
				return called;
			});
			expect(result).toBe(true);
		});

		test("is a no-op when tracker is not loaded", async ({ page }) => {
			const errored = await page.evaluate(() => {
				try {
					window.__SDK__.clear();
					return false;
				} catch {
					return true;
				}
			});
			expect(errored).toBe(false);
		});
	});

	test.describe("flush", () => {
		test("calls window.databuddy.flush", async ({ page }) => {
			const result = await page.evaluate(() => {
				let called = false;
				(window as any).databuddy = {
					flush: () => {
						called = true;
					},
					options: {},
				};
				window.__SDK__.flush();
				return called;
			});
			expect(result).toBe(true);
		});

		test("is a no-op when tracker is not loaded", async ({ page }) => {
			const errored = await page.evaluate(() => {
				try {
					window.__SDK__.flush();
					return false;
				} catch {
					return true;
				}
			});
			expect(errored).toBe(false);
		});
	});

	test.describe("getAnonymousId", () => {
		test("returns null when localStorage is empty", async ({ page }) => {
			const result = await page.evaluate(() => window.__SDK__.getAnonymousId());
			expect(result).toBeNull();
		});

		test("returns did from localStorage", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-123");
				return window.__SDK__.getAnonymousId();
			});
			expect(result).toBe("anon-123");
		});

		test("prioritizes URL param over localStorage", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-local");
				const params = new URLSearchParams("anonId=anon-url");
				return window.__SDK__.getAnonymousId(params);
			});
			expect(result).toBe("anon-url");
		});
	});

	test.describe("getSessionId", () => {
		test("returns null when sessionStorage is empty", async ({ page }) => {
			const result = await page.evaluate(() => window.__SDK__.getSessionId());
			expect(result).toBeNull();
		});

		test("returns did_session from sessionStorage", async ({ page }) => {
			const result = await page.evaluate(() => {
				sessionStorage.setItem("did_session", "sess-456");
				return window.__SDK__.getSessionId();
			});
			expect(result).toBe("sess-456");
		});

		test("prioritizes URL param over sessionStorage", async ({ page }) => {
			const result = await page.evaluate(() => {
				sessionStorage.setItem("did_session", "sess-local");
				const params = new URLSearchParams("sessionId=sess-url");
				return window.__SDK__.getSessionId(params);
			});
			expect(result).toBe("sess-url");
		});
	});

	test.describe("getTrackingIds", () => {
		test("returns both IDs", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-x");
				sessionStorage.setItem("did_session", "sess-y");
				return window.__SDK__.getTrackingIds();
			});
			expect(result.anonId).toBe("anon-x");
			expect(result.sessionId).toBe("sess-y");
		});

		test("returns nulls when storage is empty", async ({ page }) => {
			const result = await page.evaluate(() => window.__SDK__.getTrackingIds());
			expect(result.anonId).toBeNull();
			expect(result.sessionId).toBeNull();
		});
	});

	test.describe("getTrackingParams", () => {
		test("returns query string with both IDs", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-a");
				sessionStorage.setItem("did_session", "sess-b");
				return window.__SDK__.getTrackingParams();
			});

			expect(result).toContain("anonId=anon-a");
			expect(result).toContain("sessionId=sess-b");
		});

		test("returns empty string when no IDs", async ({ page }) => {
			const result = await page.evaluate(() =>
				window.__SDK__.getTrackingParams()
			);
			expect(result).toBe("");
		});

		test("returns partial string when only one ID exists", async ({ page }) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-only");
				return window.__SDK__.getTrackingParams();
			});
			expect(result).toContain("anonId=anon-only");
			expect(result).not.toContain("sessionId");
		});
	});

	test.describe("getTracker", () => {
		test("returns null when tracker is not loaded", async ({ page }) => {
			const result = await page.evaluate(() => window.__SDK__.getTracker());
			expect(result).toBeNull();
		});

		test("returns tracker instance when loaded", async ({ page }) => {
			const result = await page.evaluate(() => {
				(window as any).databuddy = {
					track: () => {},
					screenView: () => {},
					setGlobalProperties: () => {},
					clear: () => {},
					flush: () => {},
					options: { clientId: "test" },
				};
				const tracker = window.__SDK__.getTracker();
				return tracker?.options?.clientId;
			});
			expect(result).toBe("test");
		});
	});

	test.describe("createScript", () => {
		test("creates script element with correct src", async ({ page }) => {
			const result = await page.evaluate(() => {
				const script = window.__SDK__.createScript({
					clientId: "test-id",
				});
				return {
					src: script.src,
					async: script.async,
					crossOrigin: script.crossOrigin,
				};
			});

			expect(result.src).toContain("cdn.databuddy.cc/databuddy.js");
			expect(result.async).toBe(true);
			expect(result.crossOrigin).toBe("anonymous");
		});

		test("sets custom scriptUrl", async ({ page }) => {
			const result = await page.evaluate(() => {
				const script = window.__SDK__.createScript({
					clientId: "test-id",
					scriptUrl: "https://custom.cdn.com/tracker.js",
				});
				return script.src;
			});
			expect(result).toContain("custom.cdn.com/tracker.js");
		});

		test("serializes config as data attributes", async ({ page }) => {
			const result = await page.evaluate(() => {
				const script = window.__SDK__.createScript({
					clientId: "test-id",
					trackWebVitals: true,
					trackErrors: true,
					samplingRate: 0.5,
				});
				return {
					clientId: script.getAttribute("data-client-id"),
					webVitals: script.getAttribute("data-track-web-vitals"),
					errors: script.getAttribute("data-track-errors"),
					samplingRate: script.getAttribute("data-sampling-rate"),
				};
			});

			expect(result.clientId).toBe("test-id");
			expect(result.webVitals).toBe("true");
			expect(result.errors).toBe("true");
			expect(result.samplingRate).toBe("0.5");
		});

		test("skips undefined values", async ({ page }) => {
			const result = await page.evaluate(() => {
				const script = window.__SDK__.createScript({
					clientId: "test-id",
					apiUrl: undefined,
				});
				return script.hasAttribute("data-api-url");
			});
			expect(result).toBe(false);
		});
	});

	test.describe("isScriptInjected", () => {
		test("returns false when no script is injected", async ({ page }) => {
			const result = await page.evaluate(() =>
				window.__SDK__.isScriptInjected()
			);
			expect(result).toBe(false);
		});

		test("returns true after script injection", async ({ page }) => {
			const result = await page.evaluate(() => {
				const script = window.__SDK__.createScript({
					clientId: "test-id",
				});
				document.head.appendChild(script);
				return window.__SDK__.isScriptInjected();
			});
			expect(result).toBe(true);
		});
	});

	test.describe("detectClientId", () => {
		test("returns provided client ID", async ({ page }) => {
			const result = await page.evaluate(() =>
				window.__SDK__.detectClientId("my-client-id")
			);
			expect(result).toBe("my-client-id");
		});

		test("returns undefined when no client ID is available", async ({
			page,
		}) => {
			const result = await page.evaluate(() => window.__SDK__.detectClientId());
			expect(result).toBeUndefined();
		});
	});
});

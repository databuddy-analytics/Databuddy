import { resolve } from "node:path";
import { expect, test, waitForSDK } from "./test-utils";

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
		test("keeps attribution IDs after tracker clear and respects opt-out", async ({
			page,
		}) => {
			await page.route("**/track?*", (route) =>
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: "{}",
				})
			);
			await page.evaluate(() => {
				Reflect.set(window, "databuddyConfig", {
					clientId: "website_example",
					apiUrl: window.location.origin,
					ignoreBotDetection: true,
				});
			});
			await page.addScriptTag({
				path: resolve(
					import.meta.dirname,
					"../../tracker/dist/databuddy-debug.js"
				),
			});
			const before = await page.evaluate(() => window.__SDK__.getTrackingIds());
			const after = await page.evaluate(() => {
				window.__SDK__.clear();
				return {
					ids: window.__SDK__.getTrackingIds(),
					storedAnonymous: localStorage.getItem("did"),
					storedSession: sessionStorage.getItem("did_session"),
				};
			});
			expect(after.ids.anonId).toMatch(/^anon_/);
			expect(after.ids.sessionId).toMatch(/^sess_/);
			expect(after.ids.anonId).not.toBe(before.anonId);
			expect(after.ids.sessionId).not.toBe(before.sessionId);
			expect(after.storedAnonymous).toBeNull();
			expect(after.storedSession).toBeNull();
			const requestPromise = page.waitForRequest(
				(request) =>
					new URL(request.url()).pathname === "/track" &&
					(request.postData() ?? "").includes("attribution_after_clear")
			);
			await page.evaluate(() => {
				window.__SDK__.track("attribution_after_clear");
				window.__SDK__.flush();
			});
			const events = (await requestPromise).postDataJSON() as Record<
				string,
				unknown
			>[];
			expect(
				events.find((event) => event.name === "attribution_after_clear")
			).toMatchObject({
				anonymousId: after.ids.anonId,
				sessionId: after.ids.sessionId,
			});
			const optedOut = await page.evaluate(() => {
				const optOut = Reflect.get(window, "databuddyOptOut") as () => void;
				optOut();
				localStorage.setItem("did", "stale-anonymous");
				sessionStorage.setItem("did_session", "stale-session");
				return window.__SDK__.getTrackingIds();
			});
			expect(optedOut).toEqual({ anonId: null, sessionId: null });
			await page.reload();
			await waitForSDK(page);
			await page.addScriptTag({
				path: resolve(
					import.meta.dirname,
					"../../tracker/dist/databuddy-debug.js"
				),
			});
			expect(
				await page.evaluate(() => window.__SDK__.getTrackingIds())
			).toEqual({ anonId: null, sessionId: null });
		});

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

	test.describe("tracking helpers — storage throws", () => {
		test("getAnonymousId() returns null when localStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				const { getItem } = Storage.prototype;
				localStorage.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getAnonymousId();
				} finally {
					localStorage.getItem = getItem;
				}
			});
			expect(result).toBeNull();
		});

		test("getSessionId() returns null when sessionStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				const { getItem } = Storage.prototype;
				sessionStorage.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getSessionId();
				} finally {
					sessionStorage.getItem = getItem;
				}
			});
			expect(result).toBeNull();
		});

		test("getTrackingIds() returns both null when both storages throw", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				const original = Storage.prototype.getItem;
				Storage.prototype.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getTrackingIds();
				} finally {
					Storage.prototype.getItem = original;
				}
			});
			expect(result.anonId).toBeNull();
			expect(result.sessionId).toBeNull();
		});

		test("getTrackingIds() returns sessionId when only localStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				sessionStorage.setItem("did_session", "sess-ok");
				const { getItem } = Storage.prototype;
				localStorage.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getTrackingIds();
				} finally {
					localStorage.getItem = getItem;
				}
			});
			expect(result.anonId).toBeNull();
			expect(result.sessionId).toBe("sess-ok");
		});

		test("getTrackingIds() returns anonId when only sessionStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-ok");
				const { getItem } = Storage.prototype;
				sessionStorage.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getTrackingIds();
				} finally {
					sessionStorage.getItem = getItem;
				}
			});
			expect(result.anonId).toBe("anon-ok");
			expect(result.sessionId).toBeNull();
		});

		test("getTrackingParams() returns empty string when both storages throw", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				const original = Storage.prototype.getItem;
				Storage.prototype.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getTrackingParams();
				} finally {
					Storage.prototype.getItem = original;
				}
			});
			expect(result).toBe("");
		});

		test("getTrackingParams() returns partial string when only sessionStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				localStorage.setItem("did", "anon-partial");
				const { getItem } = Storage.prototype;
				sessionStorage.getItem = () => {
					throw new DOMException("Access denied", "SecurityError");
				};
				try {
					return window.__SDK__.getTrackingParams();
				} finally {
					sessionStorage.getItem = getItem;
				}
			});
			expect(result).toContain("anonId=anon-partial");
			expect(result).not.toContain("sessionId");
		});

		test("URL param takes priority without touching storage when localStorage throws", async ({
			page,
		}) => {
			const result = await page.evaluate(() => {
				const original = Storage.prototype.getItem;
				let storageWasAccessed = false;
				Storage.prototype.getItem = () => {
					storageWasAccessed = true;
					throw new DOMException("Access denied", "SecurityError");
				};
				const params = new URLSearchParams("anonId=anon-from-url");
				try {
					const id = window.__SDK__.getAnonymousId(params);
					return { id, storageWasAccessed };
				} finally {
					Storage.prototype.getItem = original;
				}
			});
			expect(result.id).toBe("anon-from-url");
			expect(result.storageWasAccessed).toBe(false);
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

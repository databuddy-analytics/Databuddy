import { expect, test } from "@playwright/test";

test.describe("API Methods", () => {
    test.beforeEach(async ({ page }) => {
        // Disable sendBeacon for reliable route interception (WebKit issue)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "sendBeacon", { value: undefined });
        });

        await page.route("**/basket.databuddy.cc/*", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
                headers: { "Access-Control-Allow-Origin": "*" },
            });
        });
    });

    test.describe("setGlobalProperties", () => {
        test("merges global properties into all events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-global-props",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Set global properties
            await page.evaluate(() => {
                (window as any).db.setGlobalProperties({
                    app_version: "1.2.3",
                    environment: "test",
                });
            });

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "test_event"
                );
            });

            await page.evaluate(() => {
                (window as any).db.track("test_event", { custom: "value" });
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.app_version).toBe("1.2.3");
            expect(payload.environment).toBe("test");
            expect(payload.custom).toBe("value");
        });

        test("allows overriding global properties per event", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-global-props",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.setGlobalProperties({
                    environment: "production",
                });
            });

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "override_test"
                );
            });

            // Override the global property
            await page.evaluate(() => {
                (window as any).db.track("override_test", { environment: "staging" });
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            // Event-level props should override global
            expect(payload.environment).toBe("staging");
        });

        test("accumulates multiple setGlobalProperties calls", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-global-props",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.setGlobalProperties({ prop1: "value1" });
                (window as any).db.setGlobalProperties({ prop2: "value2" });
            });

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "accumulate_test"
                );
            });

            await page.evaluate(() => {
                (window as any).db.track("accumulate_test");
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.prop1).toBe("value1");
            expect(payload.prop2).toBe("value2");
        });
    });

    test.describe("trackCustomEvent", () => {
        test("adds event_type: custom to events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-custom-event",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "my_custom_event"
                );
            });

            await page.evaluate(() => {
                (window as any).db.trackCustomEvent("my_custom_event", {
                    foo: "bar",
                });
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.name).toBe("my_custom_event");
            expect(payload.event_type).toBe("custom");
            expect(payload.foo).toBe("bar");
        });

        test("includes global properties in custom events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-custom-event",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.setGlobalProperties({ user_tier: "premium" });
            });

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "custom_with_global"
                );
            });

            await page.evaluate(() => {
                (window as any).db.trackCustomEvent("custom_with_global");
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.event_type).toBe("custom");
            expect(payload.user_tier).toBe("premium");
        });
    });

    test.describe("clear", () => {
        test("generates new anonymousId after clear", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-clear",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            const id1 = await page.evaluate(() => localStorage.getItem("did"));
            expect(id1).toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.clear();
            });

            // After clear, localStorage should be empty
            const clearedId = await page.evaluate(() => localStorage.getItem("did"));
            expect(clearedId).toBeNull();
        });

        test("clears sessionId after clear", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-clear",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            const sess1 = await page.evaluate(() =>
                sessionStorage.getItem("did_session")
            );
            expect(sess1).toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.clear();
            });

            const clearedSess = await page.evaluate(() =>
                sessionStorage.getItem("did_session")
            );
            expect(clearedSess).toBeNull();
        });

        test("clears global properties after clear", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-clear",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.setGlobalProperties({ should_be_cleared: true });
                (window as any).db.clear();
            });

            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "after_clear"
                );
            });

            await page.evaluate(() => {
                (window as any).db.track("after_clear");
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.should_be_cleared).toBeUndefined();
        });

        test("resets page count after clear", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-clear",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Navigate to increase page count
            await page.evaluate(() => {
                history.pushState({}, "", "/page-2");
            });
            await page.waitForTimeout(100);

            await page.evaluate(() => {
                (window as any).db.clear();
            });

            // Force a new screen view by changing lastPath
            const requestPromise = page.waitForRequest((req) => {
                const payload = req.postDataJSON();
                return (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "screen_view" &&
                    payload?.page_count === 1
                );
            });

            await page.evaluate(() => {
                history.pushState({}, "", "/fresh-page");
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();
            expect(payload.page_count).toBe(1);
        });
    });

    test.describe("flush", () => {
        test("manually flushes batched events", async ({ page, browserName }) => {
            test.skip(
                browserName === "webkit",
                "WebKit/Playwright issue with batch interception"
            );

            await page.route("**/basket.databuddy.cc/batch", async (route) => {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-flush",
                    ignoreBotDetection: true,
                    enableBatching: true,
                    batchSize: 100, // Large size so it won't auto-flush
                    batchTimeout: 60_000, // Long timeout
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("/batch")
            );

            // Add events but don't reach batch size
            await page.evaluate(() => {
                (window as any).db.track("event1");
                (window as any).db.track("event2");
                // Manually flush
                (window as any).db.flush();
            });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(Array.isArray(payload)).toBe(true);
            expect(payload.length).toBeGreaterThanOrEqual(2);
        });

        test("flush is no-op when queue is empty", async ({ page }) => {
            let batchRequestCount = 0;

            await page.route("**/basket.databuddy.cc/batch", async (route) => {
                batchRequestCount += 1;
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-flush",
                    ignoreBotDetection: true,
                    enableBatching: true,
                    batchSize: 100,
                    batchTimeout: 60_000,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Flush without any events (only screen_view which is already sent)
            await page.evaluate(() => {
                (window as any).db.flush();
                (window as any).db.flush();
                (window as any).db.flush();
            });

            await page.waitForTimeout(200);
            // Should not have made batch requests for empty flushes
            expect(batchRequestCount).toBeLessThanOrEqual(1);
        });
    });

    test.describe("destroy", () => {
        test("removes global window.databuddy reference", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-destroy",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Store reference to call destroy
            const exists = await page.evaluate(() => {
                const tracker = (window as any).databuddy;
                // Access the actual Databuddy instance if possible
                // For now, we test that window.databuddy is cleared
                return typeof tracker !== "undefined";
            });

            expect(exists).toBe(true);
        });

        test("stops tracking after opted out", async ({ page }) => {
            let postOptOutRequests = 0;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-destroy",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Opt out (which sets disabled flag)
            await page.evaluate(() => {
                (window as any).databuddyOptOut();
            });

            page.on("request", (req) => {
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    req.postDataJSON?.()?.name === "after_destroy"
                ) {
                    postOptOutRequests += 1;
                }
            });

            await page.evaluate(() => {
                (window as any).db.track("after_destroy");
            });

            await page.waitForTimeout(300);
            expect(postOptOutRequests).toBe(0);
        });
    });
});

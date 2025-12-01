import { expect, test } from "@playwright/test";

test.describe("Sampling & Filtering", () => {
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

    test.describe("samplingRate", () => {
        test("sends all events when samplingRate is 1.0", async ({ page }) => {
            let eventCount = 0;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-sampling",
                    ignoreBotDetection: true,
                    samplingRate: 1.0,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            page.on("request", (req) => {
                const payload = req.postDataJSON?.();
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name?.startsWith("test_event")
                ) {
                    eventCount += 1;
                }
            });

            // Send 10 events
            await page.evaluate(() => {
                for (let i = 0; i < 10; i++) {
                    (window as any).db.track(`test_event_${i}`);
                }
            });

            await page.waitForTimeout(500);
            expect(eventCount).toBe(10);
        });

        test("sends no events when samplingRate is 0", async ({ page }) => {
            let eventCount = 0;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-sampling",
                    ignoreBotDetection: true,
                    samplingRate: 0,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Skip initial screen_view
            await page.waitForTimeout(100);

            page.on("request", (req) => {
                const payload = req.postDataJSON?.();
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "sampled_event"
                ) {
                    eventCount += 1;
                }
            });

            // Send multiple events
            await page.evaluate(() => {
                for (let i = 0; i < 20; i++) {
                    (window as any).db.track("sampled_event");
                }
            });

            await page.waitForTimeout(500);
            expect(eventCount).toBe(0);
        });

        test("approximately samples at 50% rate", async ({ page }) => {
            let eventCount = 0;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-sampling",
                    ignoreBotDetection: true,
                    samplingRate: 0.5,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.waitForTimeout(100);

            page.on("request", (req) => {
                const payload = req.postDataJSON?.();
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "fifty_percent_event"
                ) {
                    eventCount += 1;
                }
            });

            // Send 100 events
            await page.evaluate(() => {
                for (let i = 0; i < 100; i++) {
                    (window as any).db.track("fifty_percent_event");
                }
            });

            await page.waitForTimeout(1000);

            // With 50% sampling, expect roughly 30-70 events (allowing for randomness)
            expect(eventCount).toBeGreaterThan(20);
            expect(eventCount).toBeLessThan(80);
        });
    });

    test.describe("filter function", () => {
        test("blocks events that fail filter", async ({ page }) => {
            let blockedEventSent = false;
            let allowedEventSent = false;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-filter",
                    ignoreBotDetection: true,
                    filter: (event: any) => {
                        // Block events with name starting with "blocked_"
                        return !event.name?.startsWith("blocked_");
                    },
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            page.on("request", (req) => {
                const payload = req.postDataJSON?.();
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "blocked_event"
                ) {
                    blockedEventSent = true;
                }
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "allowed_event"
                ) {
                    allowedEventSent = true;
                }
            });

            await page.evaluate(() => {
                (window as any).db.track("blocked_event");
                (window as any).db.track("allowed_event");
            });

            await page.waitForTimeout(500);

            expect(blockedEventSent).toBe(false);
            expect(allowedEventSent).toBe(true);
        });

        test("filter receives full event payload", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).receivedPayload = null;
                (window as any).databuddyConfig = {
                    clientId: "test-filter",
                    ignoreBotDetection: true,
                    filter: (event: any) => {
                        if (event.name === "inspect_event") {
                            (window as any).receivedPayload = event;
                        }
                        return true;
                    },
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            await page.evaluate(() => {
                (window as any).db.track("inspect_event", { custom_prop: "test" });
            });

            await page.waitForTimeout(200);

            const receivedPayload = await page.evaluate(
                () => (window as any).receivedPayload
            );

            expect(receivedPayload).not.toBeNull();
            expect(receivedPayload.name).toBe("inspect_event");
            expect(receivedPayload.custom_prop).toBe("test");
            expect(receivedPayload.eventId).toBeTruthy();
            expect(receivedPayload.anonymousId).toBeTruthy();
            expect(receivedPayload.sessionId).toBeTruthy();
            expect(receivedPayload.timestamp).toBeTruthy();
        });

        test("filter can block based on event properties", async ({ page }) => {
            let sensitiveEventSent = false;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-filter",
                    ignoreBotDetection: true,
                    filter: (event: any) => {
                        // Block events marked as sensitive
                        return event.is_sensitive !== true;
                    },
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            page.on("request", (req) => {
                const payload = req.postDataJSON?.();
                if (
                    req.url().includes("basket.databuddy.cc") &&
                    payload?.name === "sensitive_action"
                ) {
                    sensitiveEventSent = true;
                }
            });

            await page.evaluate(() => {
                (window as any).db.track("sensitive_action", { is_sensitive: true });
            });

            await page.waitForTimeout(300);
            expect(sensitiveEventSent).toBe(false);
        });
    });

    test.describe("skipPatterns", () => {
        test("skips exact path matches", async ({ page }) => {
            let eventSent = false;

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-skip",
                    ignoreBotDetection: true,
                    skipPatterns: ["/test"],
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            page.on("request", (req) => {
                if (req.url().includes("basket.databuddy.cc")) {
                    eventSent = true;
                }
            });

            await page.waitForTimeout(500);
            expect(eventSent).toBe(false);
        });

        test("skips wildcard path matches", async ({ page }) => {
            let eventSent = false;

            await page.goto("/test");
            await page.evaluate(() => {
                history.replaceState({}, "", "/admin/users/list");
                (window as any).databuddyConfig = {
                    clientId: "test-skip",
                    ignoreBotDetection: true,
                    skipPatterns: ["/admin/*"],
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            page.on("request", (req) => {
                if (req.url().includes("basket.databuddy.cc")) {
                    eventSent = true;
                }
            });

            await page.waitForTimeout(500);
            expect(eventSent).toBe(false);
        });

        test("does not skip non-matching paths", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                history.replaceState({}, "", "/public/page");
                (window as any).databuddyConfig = {
                    clientId: "test-skip",
                    ignoreBotDetection: true,
                    skipPatterns: ["/admin/*", "/private/*"],
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            expect(request).toBeTruthy();
        });
    });
});


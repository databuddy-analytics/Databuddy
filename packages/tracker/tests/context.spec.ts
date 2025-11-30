import { expect, test } from "@playwright/test";

test.describe("Event Context", () => {
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

    test.describe("UTM Parameters", () => {
        test("captures utm_source from URL", async ({ page }) => {
            await page.goto("/test?utm_source=google");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-utm",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.utm_source).toBe("google");
        });

        test("captures all UTM parameters", async ({ page }) => {
            await page.goto(
                "/test?utm_source=facebook&utm_medium=cpc&utm_campaign=summer_sale&utm_term=shoes&utm_content=banner_1"
            );
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-utm",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.utm_source).toBe("facebook");
            expect(payload.utm_medium).toBe("cpc");
            expect(payload.utm_campaign).toBe("summer_sale");
            expect(payload.utm_term).toBe("shoes");
            expect(payload.utm_content).toBe("banner_1");
        });

        test("utm parameters are undefined when not present", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-utm",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.utm_source).toBeUndefined();
            expect(payload.utm_medium).toBeUndefined();
        });
    });

    test.describe("Timezone", () => {
        test("captures user timezone", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-timezone",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.timezone).toBeTruthy();
            // Timezone should be a valid IANA timezone string (UTC, GMT, or Area/Location format)
            expect(payload.timezone).toMatch(/^([A-Za-z_]+\/[A-Za-z_]+|UTC|GMT)$/);
        });
    });

    test.describe("Referrer", () => {
        test("captures document referrer", async ({ page, browserName }) => {
            // WebKit has stricter referrer policies in Playwright
            test.skip(
                browserName === "webkit",
                "WebKit has stricter referrer policies that may not pass through referer header"
            );

            // Set referrer via page context
            await page.goto("/test", {
                referer: "https://google.com/search?q=test",
            });
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-referrer",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.referrer).toBe("https://google.com/search?q=test");
        });

        test("uses 'direct' when no referrer", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                // Clear any referrer
                Object.defineProperty(document, "referrer", {
                    value: "",
                    writable: true,
                });
                (window as any).databuddyConfig = {
                    clientId: "test-referrer",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.referrer).toBe("direct");
        });
    });

    test.describe("Viewport Size", () => {
        test("captures viewport dimensions", async ({ page }) => {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-viewport",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.viewport_size).toBe("1920x1080");
        });

        test("captures different viewport sizes", async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-viewport",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.viewport_size).toBe("375x667");
        });
    });

    test.describe("Language", () => {
        test("captures browser language", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-language",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.language).toBeTruthy();
            // Language should be a valid locale string
            expect(payload.language).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
        });
    });

    test.describe("Page Title", () => {
        test("captures document title", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                document.title = "My Custom Page Title";
                (window as any).databuddyConfig = {
                    clientId: "test-title",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.title).toBe("My Custom Page Title");
        });
    });

    test.describe("Path", () => {
        test("captures full path with origin", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                history.replaceState({}, "", "/my/custom/path?query=value#section");
                (window as any).databuddyConfig = {
                    clientId: "test-path",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.path).toContain("/my/custom/path");
            expect(payload.path).toContain("query=value");
            expect(payload.path).toContain("#section");
        });
    });

    test.describe("Event IDs", () => {
        test("generates unique eventId for each event", async ({ page }) => {
            const eventIds: string[] = [];

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-eventid",
                    ignoreBotDetection: true,
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
                    payload?.name?.startsWith("unique_event")
                ) {
                    eventIds.push(payload.eventId);
                }
            });

            await page.evaluate(() => {
                (window as any).db.track("unique_event_1");
                (window as any).db.track("unique_event_2");
                (window as any).db.track("unique_event_3");
            });

            await page.waitForTimeout(500);

            // All event IDs should be unique
            const uniqueIds = new Set(eventIds);
            expect(uniqueIds.size).toBe(eventIds.length);
        });

        test("eventId is a valid UUID format", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-eventid",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            // UUID v4 format
            expect(payload.eventId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );
        });
    });

    test.describe("Timestamp", () => {
        test("includes timestamp in events", async ({ page }) => {
            const beforeTime = Date.now();

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-timestamp",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            const afterTime = Date.now();

            expect(payload.timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(payload.timestamp).toBeLessThanOrEqual(afterTime);
        });
    });

    test.describe("Session & Anonymous IDs", () => {
        test("includes anonymousId in events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-ids",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.anonymousId).toBeTruthy();
            expect(payload.anonymousId).toMatch(/^anon_/);
        });

        test("includes sessionId in events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-ids",
                    ignoreBotDetection: true,
                };
            });

            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const request = await requestPromise;
            const payload = request.postDataJSON();

            expect(payload.sessionId).toBeTruthy();
            expect(payload.sessionId).toMatch(/^sess_/);
        });
    });
});


import { expect, test } from "@playwright/test";

test.describe("SPA Navigation", () => {
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

    test("tracks screen_view on pushState navigation", async ({ page }) => {
        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        // Wait for initial screen_view
        await page.waitForTimeout(100);

        const requestPromise = page.waitForRequest((req) => {
            const payload = req.postDataJSON();
            return (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view" &&
                payload?.path?.includes("/new-page")
            );
        });

        // Trigger pushState navigation
        await page.evaluate(() => {
            history.pushState({}, "", "/new-page");
        });

        const request = await requestPromise;
        const payload = request.postDataJSON();
        expect(payload.name).toBe("screen_view");
        expect(payload.path).toContain("/new-page");
        expect(payload.page_count).toBe(2);
    });

    test("tracks screen_view on replaceState navigation", async ({ page }) => {
        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        await page.waitForTimeout(100);

        const requestPromise = page.waitForRequest((req) => {
            const payload = req.postDataJSON();
            return (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view" &&
                payload?.path?.includes("/replaced-page")
            );
        });

        await page.evaluate(() => {
            history.replaceState({}, "", "/replaced-page");
        });

        const request = await requestPromise;
        const payload = request.postDataJSON();
        expect(payload.name).toBe("screen_view");
        expect(payload.path).toContain("/replaced-page");
    });

    test("tracks screen_view on popstate (back/forward)", async ({ page }) => {
        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        // Navigate forward
        await page.evaluate(() => {
            history.pushState({}, "", "/page-2");
        });
        await page.waitForTimeout(100);

        const requestPromise = page.waitForRequest((req) => {
            const payload = req.postDataJSON();
            return (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view" &&
                payload?.path?.includes("/test")
            );
        });

        // Go back
        await page.goBack();

        const request = await requestPromise;
        const payload = request.postDataJSON();
        expect(payload.name).toBe("screen_view");
    });

    test("does NOT track hash changes by default", async ({ page }) => {
        let screenViewCount = 0;

        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
                // trackHashChanges is NOT set (defaults to false)
            };
        });

        page.on("request", (req) => {
            const payload = req.postDataJSON?.();
            if (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view"
            ) {
                screenViewCount += 1;
            }
        });

        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        // Wait for initial screen_view
        await page.waitForTimeout(200);
        const initialCount = screenViewCount;

        // Change hash - should NOT trigger another screen_view
        await page.evaluate(() => {
            window.location.hash = "#section";
        });

        await page.waitForTimeout(300);

        // Count should not have increased
        expect(screenViewCount).toBe(initialCount);
    });

    test("tracks hash changes when trackHashChanges is enabled", async ({
        page,
    }) => {
        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
                trackHashChanges: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        await page.waitForTimeout(100);

        const requestPromise = page.waitForRequest((req) => {
            const payload = req.postDataJSON();
            return (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view" &&
                payload?.path?.includes("#my-section")
            );
        });

        await page.evaluate(() => {
            window.location.hash = "#my-section";
        });

        const request = await requestPromise;
        const payload = request.postDataJSON();
        expect(payload.path).toContain("#my-section");
    });

    test("debounces rapid navigation events", async ({ page }) => {
        let screenViewCount = 0;

        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        // Wait for initial screen_view
        await page.waitForTimeout(100);

        page.on("request", (req) => {
            const payload = req.postDataJSON?.();
            if (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view"
            ) {
                screenViewCount += 1;
            }
        });

        // Fire multiple navigations rapidly
        await page.evaluate(() => {
            history.pushState({}, "", "/page-1");
            history.pushState({}, "", "/page-2");
            history.pushState({}, "", "/page-3");
        });

        // Wait for debounce to settle
        await page.waitForTimeout(200);

        // Should only have tracked the final URL due to debouncing
        expect(screenViewCount).toBeLessThanOrEqual(2);
    });

    test("does not track same URL twice", async ({ page }) => {
        let screenViewCount = 0;

        await page.goto("/test");
        await page.evaluate(() => {
            (window as any).databuddyConfig = {
                clientId: "test-spa",
                ignoreBotDetection: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        await page.waitForTimeout(100);
        screenViewCount = 0; // Reset after initial

        page.on("request", (req) => {
            const payload = req.postDataJSON?.();
            if (
                req.url().includes("basket.databuddy.cc") &&
                payload?.name === "screen_view"
            ) {
                screenViewCount += 1;
            }
        });

        // Call screenView manually for same URL
        await page.evaluate(() => {
            (window as any).db.screenView();
            (window as any).db.screenView();
            (window as any).db.screenView();
        });

        await page.waitForTimeout(100);
        expect(screenViewCount).toBe(0); // Should not track since URL hasn't changed
    });
});


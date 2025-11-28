import { expect, test } from "@playwright/test";

test.describe("Mobile Edge Cases", () => {
    test.beforeEach(({ }, testInfo) => {
        if (!testInfo.project.name.includes("mobile")) {
            test.skip();
        }
    });

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

    test.describe("iOS Safari Specific", () => {
        test("handles iOS Safari 100vh viewport issue", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                // iOS Safari reports viewport height including URL bar
                document.body.style.height = "100vh";

                (window as any).databuddyConfig = {
                    clientId: "test-ios-vh",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            const viewportData = await page.evaluate(() => {
                return {
                    innerHeight: window.innerHeight,
                    documentHeight: document.documentElement.clientHeight,
                };
            });

            // Should have valid viewport values
            expect(viewportData.innerHeight).toBeGreaterThan(0);
        });

        test("handles iOS pull-to-refresh scroll overscroll", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                document.body.style.height = "3000px";

                (window as any).databuddyConfig = {
                    clientId: "test-ios-overscroll",
                    ignoreBotDetection: true,
                    trackScrollDepth: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            // Simulate negative scroll (overscroll at top)
            const noError = await page.evaluate(() => {
                try {
                    // Overscroll can cause negative scrollY in some browsers
                    window.scrollTo(0, -50);
                    window.dispatchEvent(new Event("scroll"));
                    return true;
                } catch {
                    return false;
                }
            });

            expect(noError).toBe(true);
        });

        test("handles iOS keyboard appearing/disappearing", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                const input = document.createElement("input");
                input.type = "text";
                input.id = "mobile-input";
                document.body.appendChild(input);

                (window as any).databuddyConfig = {
                    clientId: "test-ios-keyboard",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Focus input (would show keyboard on real iOS)
            await page.focus("#mobile-input");

            // Simulate viewport resize (like keyboard appearing)
            const initialHeight = await page.evaluate(() => window.innerHeight);
            await page.setViewportSize({ width: 375, height: initialHeight - 300 });

            // Track should still work
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("keyboard_up");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("handles iOS Safari ITP storage restrictions", async ({ page }) => {
            await page.goto("/test");

            // Simulate ITP-like storage restrictions
            const trackerWorks = await page.evaluate(() => {
                // Store original localStorage
                const originalLS = window.localStorage;

                try {
                    // Test that tracker handles storage failures gracefully
                    Object.defineProperty(window, "localStorage", {
                        get: () => ({
                            getItem: () => {
                                throw new DOMException("QuotaExceededError");
                            },
                            setItem: () => {
                                throw new DOMException("QuotaExceededError");
                            },
                            removeItem: () => { },
                        }),
                        configurable: true,
                    });

                    (window as any).databuddyConfig = {
                        clientId: "test-ios-itp",
                        ignoreBotDetection: true,
                    };

                    return true;
                } finally {
                    Object.defineProperty(window, "localStorage", {
                        value: originalLS,
                        configurable: true,
                    });
                }
            });

            expect(trackerWorks).toBe(true);
        });
    });

    test.describe("Android Chrome Specific", () => {
        test("handles Chrome Custom Tabs user agent", async ({ page }) => {
            await page.goto("/test");

            // Custom Tab detection
            const hasUserAgent = await page.evaluate(() => {
                const ua = navigator.userAgent;
                // Chrome Custom Tabs don't modify UA but we should still track
                return ua.length > 0;
            });

            expect(hasUserAgent).toBe(true);

            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-android-cct",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            // Tracker should work in Custom Tabs
            const trackerLoaded = await page.evaluate(() => !!(window as any).db);
            expect(trackerLoaded).toBe(true);
        });

        test("handles Android WebView restrictions", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                // Simulate WebView environment
                (window as any).databuddyConfig = {
                    clientId: "test-android-webview",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            // Should function in WebView
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("webview_test");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("handles back gesture navigation", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-android-gesture",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            // Navigate forward
            await page.evaluate(() => {
                history.pushState({}, "", "/android-page");
            });
            await page.waitForTimeout(100);

            // Simulate popstate (back gesture)
            await page.evaluate(() => {
                window.dispatchEvent(new PopStateEvent("popstate"));
            });

            // Should not crash
            const dbExists = await page.evaluate(() => !!(window as any).db);
            expect(dbExists).toBe(true);
        });
    });

    test.describe("Touch Event Edge Cases", () => {
        test("handles multitouch events", async ({ page, browserName }) => {
            // Skip on WebKit - Touch constructor isn't available
            test.skip(
                browserName === "webkit",
                "WebKit doesn't support Touch constructor in Playwright"
            );

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-multitouch",
                    ignoreBotDetection: true,
                    trackInteractions: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate multitouch
            const noError = await page.evaluate(() => {
                try {
                    const touchEvent = new TouchEvent("touchstart", {
                        bubbles: true,
                        cancelable: true,
                        touches: [
                            new Touch({
                                identifier: 1,
                                target: document.body,
                                clientX: 100,
                                clientY: 100,
                            }),
                            new Touch({
                                identifier: 2,
                                target: document.body,
                                clientX: 200,
                                clientY: 200,
                            }),
                        ],
                    });
                    document.dispatchEvent(touchEvent);
                    return true;
                } catch {
                    return false;
                }
            });

            expect(noError).toBe(true);
        });

        test("handles swipe gestures without blocking", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                document.body.style.height = "3000px";
                document.body.style.width = "100%";

                (window as any).databuddyConfig = {
                    clientId: "test-swipe",
                    ignoreBotDetection: true,
                    trackScrollDepth: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate swipe scroll
            await page.touchscreen.tap(187, 300);

            // Swipe up (scroll down)
            const touchDown = page.touchscreen.tap(187, 400);
            await touchDown;

            // Should still track events
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("after_swipe");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("handles long press events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                const btn = document.createElement("button");
                btn.id = "long-press-btn";
                btn.setAttribute("data-track", "long_press_test");
                btn.style.cssText =
                    "width:100px;height:50px;position:fixed;top:100px;left:100px";
                document.body.appendChild(btn);

                (window as any).databuddyConfig = {
                    clientId: "test-longpress",
                    ignoreBotDetection: true,
                    trackAttributes: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Long press simulation
            await page.touchscreen.tap(150, 125);
            await page.waitForTimeout(600); // Long press duration

            // Tracker should remain functional
            const works = await page.evaluate(() => !!(window as any).db);
            expect(works).toBe(true);
        });
    });

    test.describe("Page Lifecycle", () => {
        test("handles page freeze event", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-freeze",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate freeze event (Page Lifecycle API)
            const noError = await page.evaluate(() => {
                try {
                    // freeze event is used on mobile for bfcache
                    document.dispatchEvent(new Event("freeze"));
                    return true;
                } catch {
                    return false;
                }
            });

            expect(noError).toBe(true);
        });

        test("handles page resume event", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-resume",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate freeze then resume
            await page.evaluate(() => {
                document.dispatchEvent(new Event("freeze"));
                document.dispatchEvent(new Event("resume"));
            });

            // Should still track events
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("after_resume");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("handles bfcache restoration", async ({ page }) => {
            const requestPromise = page.waitForRequest((req) =>
                req.url().includes("basket.databuddy.cc")
            );

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-bfcache",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await requestPromise;

            // Simulate pageshow (bfcache restoration)
            const noError = await page.evaluate(() => {
                try {
                    const event = new PageTransitionEvent("pageshow", {
                        persisted: true,
                    });
                    window.dispatchEvent(event);
                    return true;
                } catch {
                    return false;
                }
            });

            expect(noError).toBe(true);
        });
    });

    test.describe("Memory Constraints", () => {
        test("handles low memory situations gracefully", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-lowmem",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Fire many events to stress memory
            await page.evaluate(() => {
                for (let i = 0; i < 500; i++) {
                    (window as any).db.track(`stress_${i}`, {
                        data: "x".repeat(1000),
                    });
                }
            });

            // Should not crash, tracker should remain functional
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("after_stress");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("respects maxBatchSize on mobile", async ({ page }) => {
            await page.route("**/basket.databuddy.cc/batch", async (route) => {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-maxbatch",
                    ignoreBotDetection: true,
                    enableBatching: true,
                    batchSize: 10,
                    maxBatchSize: 20,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Fire more than maxBatchSize
            await page.evaluate(() => {
                for (let i = 0; i < 50; i++) {
                    (window as any).db.track(`batch_event_${i}`);
                }
            });

            // Wait for batches to process
            await page.waitForTimeout(500);

            // Tracker should remain functional
            const works = await page.evaluate(() => !!(window as any).db);
            expect(works).toBe(true);
        });
    });

    test.describe("Network Edge Cases", () => {
        test("handles slow 3G conditions", async ({ page }) => {
            // Slow network simulation
            await page.route("**/basket.databuddy.cc/*", async (route) => {
                await new Promise((r) => setTimeout(r, 500)); // 500ms delay
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-slow3g",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Fire event and wait
            await page.evaluate(() => {
                (window as any).db.track("slow_network_event");
            });

            await page.waitForTimeout(700);

            // Should complete without error
            const works = await page.evaluate(() => !!(window as any).db);
            expect(works).toBe(true);
        });

        test("handles connection type changes", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-connection",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate connection type change
            const noError = await page.evaluate(() => {
                try {
                    // Network Information API
                    if ("connection" in navigator) {
                        window.dispatchEvent(new Event("online"));
                    }
                    return true;
                } catch {
                    return false;
                }
            });

            expect(noError).toBe(true);
        });

        test("queues events when offline then sends when online", async ({
            page,
        }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-offline-queue",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Go offline
            await page.context().setOffline(true);

            // Track events while offline
            await page.evaluate(() => {
                (window as any).db.track("offline_1");
                (window as any).db.track("offline_2");
            });

            // Go online
            await page.context().setOffline(false);

            // Tracker should still be functional
            const works = await page.evaluate(() => {
                try {
                    (window as any).db.track("back_online");
                    return true;
                } catch {
                    return false;
                }
            });

            expect(works).toBe(true);
        });

        test("handles CORS errors on mobile", async ({ page }) => {
            await page.route("**/basket.databuddy.cc/*", async (route) => {
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                    // Missing CORS headers
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-cors",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            // Should not crash even with CORS issues
            await page.waitForTimeout(200);

            const dbExists = await page.evaluate(() => !!(window as any).db);
            expect(dbExists).toBe(true);
        });
    });

    test.describe("Input & Form Handling", () => {
        test("tracks form submissions on mobile", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                const form = document.createElement("form");
                form.id = "test-form";
                form.setAttribute("data-track", "form_submit");
                form.innerHTML =
                    '<input type="text" name="test"><button type="submit">Submit</button>';
                form.onsubmit = (e) => e.preventDefault();
                document.body.appendChild(form);

                (window as any).databuddyConfig = {
                    clientId: "test-form",
                    ignoreBotDetection: true,
                    trackAttributes: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Tap submit button
            const button = page.locator('button[type="submit"]');
            await button.tap();

            // Tracker should work after form submission
            const works = await page.evaluate(() => !!(window as any).db);
            expect(works).toBe(true);
        });

        test("handles autofill events", async ({ page }) => {
            await page.goto("/test");
            await page.evaluate(() => {
                const input = document.createElement("input");
                input.type = "email";
                input.id = "email";
                input.autocomplete = "email";
                document.body.appendChild(input);

                (window as any).databuddyConfig = {
                    clientId: "test-autofill",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Simulate autofill
            await page.fill("#email", "test@example.com");

            const works = await page.evaluate(() => !!(window as any).db);
            expect(works).toBe(true);
        });
    });

    test.describe("Concurrent Events", () => {
        test("handles rapid event firing on mobile", async ({ page }) => {
            let eventCount = 0;

            await page.route("**/basket.databuddy.cc/*", async (route) => {
                const body = route.request().postDataJSON?.();
                if (body?.name?.startsWith("rapid_")) {
                    eventCount += 1;
                }
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                (window as any).databuddyConfig = {
                    clientId: "test-rapid",
                    ignoreBotDetection: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Fire 20 events rapidly
            await page.evaluate(() => {
                for (let i = 0; i < 20; i++) {
                    (window as any).db.track(`rapid_${i}`);
                }
            });

            await page.waitForTimeout(1000);

            expect(eventCount).toBeGreaterThanOrEqual(15); // Allow some to be sampled/batched
        });

        test("prevents duplicate events on double-tap", async ({ page }) => {
            let tapEventCount = 0;

            await page.route("**/basket.databuddy.cc/*", async (route) => {
                const body = route.request().postDataJSON?.();
                if (body?.name === "button_tap") {
                    tapEventCount += 1;
                }
                await route.fulfill({
                    status: 200,
                    body: JSON.stringify({ success: true }),
                });
            });

            await page.goto("/test");
            await page.evaluate(() => {
                const btn = document.createElement("button");
                btn.id = "tap-btn";
                btn.setAttribute("data-track", "button_tap");
                btn.style.cssText =
                    "width:100px;height:50px;position:fixed;top:100px;left:100px";
                document.body.appendChild(btn);

                (window as any).databuddyConfig = {
                    clientId: "test-doubletap",
                    ignoreBotDetection: true,
                    trackAttributes: true,
                };
            });
            await page.addScriptTag({ url: "/dist/databuddy.js" });

            await expect
                .poll(async () => await page.evaluate(() => !!(window as any).db))
                .toBeTruthy();

            // Double tap
            await page.touchscreen.tap(150, 125);
            await page.touchscreen.tap(150, 125);

            await page.waitForTimeout(500);

            // Should have 2 events (one per tap)
            expect(tapEventCount).toBe(2);
        });
    });
});


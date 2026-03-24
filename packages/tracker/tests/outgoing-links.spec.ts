import { expect, test } from "@playwright/test";
import { findEvent, hasEvent } from "./test-utils";

test.describe("Outgoing Links Tracking", () => {
    test.beforeEach(async ({ page }) => {
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

    test("tracks clicks on external links", async ({ page }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "https://external-site.com/page";
            link.innerText = "External Link";
            link.id = "external-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(req, (e) => e.href === "https://external-site.com/page")
        );

        await page.evaluate(() => {
            const link = document.getElementById("external-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#external-link");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) =>
            Boolean(e.href === "https://external-site.com/page")
        );
        expect(outgoing).toBeTruthy();
        expect(outgoing?.href).toBe("https://external-site.com/page");
        expect(outgoing?.text).toBe("External Link");
    });

    test("does not track internal links", async ({ page }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "/internal-page";
            link.innerText = "Internal Link";
            link.id = "internal-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("internal-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#internal-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("does not track javascript: links", async ({ page }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "javascript:void(0)";
            link.innerText = "JS Link";
            link.id = "js-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("js-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#js-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("does not track mailto: links", async ({ page }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "mailto:test@example.com";
            link.innerText = "Email Link";
            link.id = "mailto-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("mailto-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#mailto-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("does not track tel: links", async ({ page }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "tel:+1234567890";
            link.innerText = "Phone Link";
            link.id = "tel-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("tel-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#tel-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("tracks clicks on child elements of external links", async ({
        page,
    }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "https://external-site.com/page";
            link.id = "external-link";
            link.innerHTML = '<span id="link-child">Click me</span>';
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(req, (e) => e.href === "https://external-site.com/page")
        );

        await page.evaluate(() => {
            const link = document.getElementById("external-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#link-child");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) =>
            Boolean(e.href === "https://external-site.com/page")
        );
        expect(outgoing).toBeTruthy();
        expect(outgoing?.href).toBe("https://external-site.com/page");
    });

    test("uses title as fallback when innerText is empty", async ({ page }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "https://external-site.com/page";
            link.title = "Link Title";
            link.id = "external-link";
            link.innerHTML = '<img src="/image.png" />';
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(req, (e) => e.text === "Link Title")
        );

        await page.evaluate(() => {
            const link = document.getElementById("external-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#external-link");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) => e.text === "Link Title");
        expect(outgoing).toBeTruthy();
        expect(outgoing?.text).toBe("Link Title");
    });

    test("treats same origin with different path as internal", async ({
        page,
    }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        const currentOrigin = await page.evaluate(() => window.location.origin);

        await page.evaluate((origin) => {
            const link = document.createElement("a");
            link.href = `${origin}/different-page`;
            link.innerText = "Same Origin Link";
            link.id = "same-origin-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        }, currentOrigin);
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("same-origin-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#same-origin-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("tracks protocol-relative external links", async ({ page }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "//external-site.com/page";
            link.innerText = "Protocol Relative Link";
            link.id = "protocol-relative-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(req, (e) =>
                    typeof e.href === "string"
                        ? e.href.includes("external-site.com/page")
                        : false
                )
        );

        await page.evaluate(() => {
            const link = document.getElementById("protocol-relative-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#protocol-relative-link");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) =>
            typeof e.href === "string" ? e.href.includes("external-site.com/page") : false
        );
        expect(outgoing).toBeTruthy();
        expect(String(outgoing?.href)).toContain("external-site.com/page");
    });

    test("does not track hash-only links", async ({ page }) => {
        let outgoingTracked = false;

        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "#section";
            link.innerText = "Hash Link";
            link.id = "hash-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        page.on("request", (req) => {
            if (req.url().includes("/outgoing")) {
                outgoingTracked = true;
            }
        });

        await page.evaluate(() => {
            const link = document.getElementById("hash-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#hash-link");

        await page.waitForTimeout(200);
        expect(outgoingTracked).toBe(false);
    });

    test("tracks subdomain as external link", async ({ page }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "https://subdomain.localhost/page";
            link.innerText = "Subdomain Link";
            link.id = "subdomain-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(
                    req,
                    (e) => e.href === "https://subdomain.localhost/page"
                )
        );

        await page.evaluate(() => {
            const link = document.getElementById("subdomain-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#subdomain-link");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) =>
            Boolean(e.href === "https://subdomain.localhost/page")
        );
        expect(outgoing).toBeTruthy();
        expect(outgoing?.href).toBe("https://subdomain.localhost/page");
    });

    test("does not throw on links without href", async ({ page }) => {
        await page.goto("/test");
        await page.evaluate(() => {
            const link = document.createElement("a");
            link.innerText = "No Href Link";
            link.id = "no-href-link";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const noError = await page.evaluate(() => {
            try {
                const link = document.getElementById("no-href-link");
                link?.click();
                return true;
            } catch {
                return false;
            }
        });

        expect(noError).toBe(true);
    });

    test("tracks external link with empty anchor element", async ({ page }) => {
        await page.goto("/test");

        await page.evaluate(() => {
            const link = document.createElement("a");
            link.href = "https://external-site.com/page";
            link.id = "empty-link";
            link.style.display = "inline-block";
            link.style.width = "50px";
            link.style.height = "50px";
            link.style.background = "blue";
            document.body.appendChild(link);

            (window as any).databuddyConfig = {
                clientId: "test-outgoing",
                ignoreBotDetection: true,
                batchTimeout: 200,
                trackOutgoingLinks: true,
            };
        });
        await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

        await expect
            .poll(async () => await page.evaluate(() => !!(window as any).db))
            .toBeTruthy();

        const requestPromise = page.waitForRequest(
            (req) =>
                req.url().includes("/outgoing") &&
                hasEvent(req, (e) => e.href === "https://external-site.com/page")
        );

        await page.evaluate(() => {
            const link = document.getElementById("empty-link");
            link?.addEventListener("click", (e) => e.preventDefault());
        });
        await page.click("#empty-link");

        const request = await requestPromise;
        const outgoing = findEvent(request, (e) =>
            Boolean(e.href === "https://external-site.com/page")
        );
        expect(outgoing).toBeTruthy();
        expect(outgoing?.href).toBe("https://external-site.com/page");
        expect(outgoing?.text).toBe("");
    });
});


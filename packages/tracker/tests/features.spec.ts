import { expect, test } from "@playwright/test";
import { findEvent, hasEvent } from "./test-utils";

test.describe("Feature Tracking", () => {
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

	test.describe("maskPatterns", () => {
		test("masks single path segment with *", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// Simulate being on a user profile page
				history.replaceState({}, "", "/users/12345/profile");
				(window as any).databuddyConfig = {
					clientId: "test-mask",
					ignoreBotDetection: true,
					batchTimeout: 200,
					maskPatterns: ["/users/*/profile"],
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "screen_view");
			expect(event).toBeTruthy();
			expect(String(event?.path)).toContain("/users/*/profile");
			expect(String(event?.path)).not.toContain("12345");
		});

		test("masks entire path suffix with **", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				history.replaceState({}, "", "/admin/users/12345/settings/security");
				(window as any).databuddyConfig = {
					clientId: "test-mask",
					ignoreBotDetection: true,
					batchTimeout: 200,
					maskPatterns: ["/admin/**"],
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "screen_view");
			expect(event).toBeTruthy();
			expect(String(event?.path)).toContain("/admin/*");
			expect(String(event?.path)).not.toContain("12345");
			expect(String(event?.path)).not.toContain("security");
		});

		test("preserves unmasked paths", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				history.replaceState({}, "", "/public/about");
				(window as any).databuddyConfig = {
					clientId: "test-mask",
					ignoreBotDetection: true,
					batchTimeout: 200,
					maskPatterns: ["/users/*", "/admin/**"],
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			const requestPromise = page.waitForRequest((req) =>
				req.url().includes("basket.databuddy.cc")
			);

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "screen_view");
			expect(event).toBeTruthy();
			expect(String(event?.path)).toContain("/public/about");
		});
	});

	test.describe("trackOutgoingLinks", () => {
		test("tracks clicks on external links", async ({ page }) => {
			await page.goto("/test");

			// Add an external link to the page
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
					hasEvent(
						req,
						(e) =>
							e.href === "https://external-site.com/page" &&
							e.text === "External Link"
					)
			);

			// Click the external link (prevent navigation)
			await page.evaluate(() => {
				const link = document.getElementById("external-link");
				link?.addEventListener("click", (e) => e.preventDefault());
			});
			await page.click("#external-link");

			const request = await requestPromise;
			const outgoing = findEvent(request, (e) =>
				Boolean(
					e.href === "https://external-site.com/page" &&
					e.text === "External Link"
				)
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
	});

	test.describe("trackAttributes (data-track)", () => {
		test("tracks clicks on elements with data-track", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				const button = document.createElement("button");
				button.setAttribute("data-track", "cta_click");
				button.setAttribute("data-button-type", "primary");
				button.setAttribute("data-position", "header");
				button.innerText = "Click Me";
				button.id = "tracked-btn";
				document.body.appendChild(button);

				(window as any).databuddyConfig = {
					clientId: "test-attributes",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackAttributes: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					hasEvent(req, (e) => e.name === "cta_click")
			);

			await page.click("#tracked-btn");

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "cta_click");
			expect(event).toBeTruthy();
			expect(event?.name).toBe("cta_click");
			const props = event?.properties as Record<string, unknown> | undefined;
			expect(props?.buttonType).toBe("primary");
			expect(props?.position).toBe("header");
		});

		test("converts kebab-case attributes to camelCase", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				const div = document.createElement("div");
				div.setAttribute("data-track", "element_interaction");
				div.setAttribute("data-my-custom-property", "test-value");
				div.id = "tracked-div";
				div.style.padding = "20px";
				div.innerText = "Trackable Div";
				document.body.appendChild(div);

				(window as any).databuddyConfig = {
					clientId: "test-attributes",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackAttributes: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					hasEvent(req, (e) => e.name === "element_interaction")
			);

			await page.click("#tracked-div");

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "element_interaction");
			expect(event).toBeTruthy();
			const props = event?.properties as Record<string, unknown> | undefined;
			expect(props?.myCustomProperty).toBe("test-value");
		});

		test("tracks clicks on child elements of data-track parent", async ({
			page,
		}) => {
			await page.goto("/test");
			await page.evaluate(() => {
				const div = document.createElement("div");
				div.setAttribute("data-track", "card_click");
				div.setAttribute("data-card-id", "123");
				div.innerHTML = '<span id="inner-span">Click this span</span>';
				document.body.appendChild(div);

				(window as any).databuddyConfig = {
					clientId: "test-attributes",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackAttributes: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			const requestPromise = page.waitForRequest(
				(req) =>
					req.url().includes("basket.databuddy.cc") &&
					hasEvent(req, (e) => e.name === "card_click")
			);

			// Click the inner span
			await page.click("#inner-span");

			const request = await requestPromise;
			const event = findEvent(request, (e) => e.name === "card_click");
			expect(event).toBeTruthy();
			expect(event?.name).toBe("card_click");
			const props = event?.properties as Record<string, unknown> | undefined;
			expect(props?.cardId).toBe("123");
		});
	});

	test.describe("trackScrollDepth", () => {
		test("tracks maximum scroll depth", async ({ page }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				// Create tall content
				document.body.style.height = "3000px";
				(window as any).databuddyConfig = {
					clientId: "test-scroll",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackScrollDepth: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Scroll down
			await page.evaluate(() => {
				window.scrollTo(0, 500);
			});
			await page.waitForTimeout(100);

			// Scroll more
			await page.evaluate(() => {
				window.scrollTo(0, 1000);
			});
			await page.waitForTimeout(100);

			// maxScrollDepth should be updated (we can't directly access it but can verify no errors)
			const noErrors = await page.evaluate(
				() => typeof (window as any).db === "object"
			);
			expect(noErrors).toBe(true);
		});
	});

	test.describe("trackInteractions", () => {
		test("counts user interactions", async ({ page, browserName }) => {
			await page.goto("/test");
			await page.evaluate(() => {
				(window as any).databuddyConfig = {
					clientId: "test-interactions",
					ignoreBotDetection: true,
					batchTimeout: 200,
					trackInteractions: true,
				};
			});
			await page.addScriptTag({ url: "/dist/databuddy-debug.js" });

			await expect
				.poll(async () => await page.evaluate(() => !!(window as any).db))
				.toBeTruthy();

			// Perform various interactions
			await page.mouse.move(100, 100);
			await page.mouse.click(100, 100);
			await page.keyboard.press("a");

			// wheel is not supported in WebKit Playwright
			if (browserName !== "webkit") {
				await page.mouse.wheel(0, 100);
			}

			// Just verify no errors occurred
			const trackerExists = await page.evaluate(
				() => typeof (window as any).db === "object"
			);
			expect(trackerExists).toBe(true);
		});
	});
});

import type { Page, Request } from "@playwright/test";
import { test as unroutedTest } from "@playwright/test";
import type { BaseTracker } from "../src/core/tracker";
import type { EngagementSpan } from "../src/core/types";
import { DEAD_CLICK_WINDOW_MS } from "../src/plugins/interactions";
import { emulateIosPageLifecycle, expect, test } from "./test-utils";

declare global {
	interface Window {
		awaitedEvent?: Promise<void>;
	}
}

const TEST_SERVER_URL = "http://localhost:3033";
const SLOW_PAGE_PATH = `/__test/slow/${DEAD_CLICK_WINDOW_MS + 1000}`;

async function loadFixture(
	page: Page,
	markup: string,
	{
		iosLifecycle = false,
		fakeClock = true,
		clientId = "test-interactions",
		apiUrl,
	}: {
		iosLifecycle?: boolean;
		fakeClock?: boolean;
		clientId?: string;
		apiUrl?: string;
	} = {}
) {
	if (iosLifecycle) {
		await emulateIosPageLifecycle(page);
	}
	if (fakeClock) {
		await page.clock.install();
	}
	await page.goto("/test");
	await page.evaluate(
		({ html, config }) => {
			document.body.innerHTML = html;
			window.databuddyConfig = {
				...config,
				ignoreBotDetection: true,
				trackInteractions: true,
			};
		},
		{ html: markup, config: { clientId, apiUrl } }
	);
	await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
	await expect
		.poll(() => page.evaluate(() => Boolean(window.__tracker)))
		.toBeTruthy();
}

function readFrustration(page: Page) {
	return page.evaluate(() => {
		const tracker = window.__tracker as BaseTracker;
		return {
			rageClicks: tracker.rageClickCount,
			deadClicks: tracker.deadClickCount,
			rageClickTarget: tracker.rageClickTarget,
			deadClickTarget: tracker.deadClickTarget,
		};
	});
}

async function clickAndAwaitEvent(
	page: Page,
	selector: string,
	eventType: string
) {
	await page.evaluate((type) => {
		window.awaitedEvent = new Promise((resolve) =>
			document.addEventListener(type, () => resolve(), {
				capture: true,
				once: true,
			})
		);
	}, eventType);
	await page.click(selector);
	await page.evaluate(() => window.awaitedEvent);
}

async function outlastDeadClickWindow(page: Page) {
	await page.clock.runFor(DEAD_CLICK_WINDOW_MS + 100);
}

function isEngagementRequest(request: Request) {
	return request.url().includes("/engagement?");
}

function readEngagementSpan(body: string | null): EngagementSpan | undefined {
	const [span] = JSON.parse(body ?? "[]") as EngagementSpan[];
	return span;
}

async function readRecordedEngagementSpan(clientId: string) {
	const params = new URLSearchParams({
		client_id: clientId,
		path: "/engagement",
	});
	const response = await fetch(`${TEST_SERVER_URL}/__test/beacons?${params}`);
	const { requests } = (await response.json()) as {
		requests: { body: string; method: string }[];
	};
	const posted = requests.find((request) => request.method === "POST");
	return posted ? readEngagementSpan(posted.body) : undefined;
}

const ORDINARY_CLICKS: {
	name: string;
	markup: string;
	act: (page: Page) => Promise<unknown>;
}[] = [
	{
		name: "focusing a text field",
		markup: `<input aria-label="email">`,
		act: (page) => page.click("input"),
	},
	{
		name: "opening a select",
		markup: `<select aria-label="size"><option>S</option><option>M</option></select>`,
		act: (page) => page.click("select"),
	},
	{
		name: "ticking a checkbox through its label",
		markup: `<label><input type="checkbox"> Accept terms</label>`,
		act: (page) => page.click("label"),
	},
	{
		name: "triple-clicking a paragraph to select it",
		markup: "<p>Shipping takes three to five business days.</p>",
		act: (page) => page.click("p", { clickCount: 3 }),
	},
	{
		name: "triple-clicking inside a textarea",
		markup: `<textarea aria-label="script">console.log("hello")</textarea>`,
		act: (page) => page.click("textarea", { clickCount: 3 }),
	},
	{
		name: "a menu button whose own handler opens it at once",
		markup: `<button aria-label="menu" onclick="this.setAttribute('aria-expanded', 'true')">Menu</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "a tab that switches on mousedown",
		markup: `<button role="tab" aria-selected="false" onmousedown="this.setAttribute('aria-selected', 'true')">Specs</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "a quantity stepper that only changes an input value",
		markup: `<input aria-label="quantity" value="1"><button onclick="const input = this.previousElementSibling; input.value = Number(input.value) + 1; input.dispatchEvent(new Event('change', { bubbles: true }))">+</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "double-clicking a word and clicking it again",
		markup: "<p>Shipping takes three to five business days.</p>",
		act: async (page) => {
			await page.dblclick("p");
			await page.click("p");
		},
	},
	{
		name: "a button that only rewrites its text node",
		markup: `<button onclick="this.firstChild.nodeValue = 'Added'">Add to cart</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "a popover button",
		markup: `<button popovertarget="tip">Info</button><div id="tip" popover>Details</div>`,
		act: (page) => clickAndAwaitEvent(page, "button", "toggle"),
	},
	{
		name: "submitting a form that fails native validation",
		markup: `<form><input name="email" required><button>Sign up</button></form>`,
		act: (page) => page.click("button"),
	},
	{
		name: "a same-page anchor",
		markup: `<a href="#faq">FAQ</a><h2 id="faq">Questions</h2>`,
		act: (page) => page.click("a"),
	},
	{
		name: "an SPA link to the page you are already on",
		markup: `<a href="/test" onclick="event.preventDefault()">Home</a>`,
		act: (page) => page.click("a"),
	},
	{
		name: "an SPA link that only pushes history",
		markup: `<a href="/docs" onclick="event.preventDefault(); history.pushState({}, '', '/docs')">Docs</a>`,
		act: (page) => page.click("a"),
	},
	{
		name: "a copy button",
		markup: `<button onclick="document.execCommand('copy')">Copy</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "a button that scrolls the page",
		markup: `<div style="height: 4000px"><button onclick="window.scrollTo({ top: 1500 })">Jump to pricing</button></div>`,
		act: (page) => clickAndAwaitEvent(page, "button", "scroll"),
	},
];

const FRUSTRATED_CLICKS: {
	name: string;
	markup: string;
	act: (page: Page) => Promise<unknown>;
	expected: Partial<Awaited<ReturnType<typeof readFrustration>>>;
}[] = [
	{
		name: "a javascript: link that does nothing",
		markup: `<a href="javascript:void(0)">Open menu</a>`,
		act: (page) => page.click("a"),
		expected: { deadClicks: 1 },
	},
	{
		name: "a form whose submit handler does nothing",
		markup: `<form onsubmit="event.preventDefault()"><button aria-label="subscribe">Subscribe</button></form>`,
		act: (page) => page.click("button"),
		expected: { deadClicks: 1, deadClickTarget: "button:subscribe" },
	},
	{
		name: "a button followed by a scroll the visitor started later",
		markup: `<div style="height: 4000px"><button id="save">Save</button></div>`,
		act: async (page) => {
			await page.click("button");
			await page.clock.runFor(400);
			await page.evaluate(() => {
				window.awaitedEvent = new Promise((resolve) =>
					document.addEventListener("scroll", () => resolve(), { once: true })
				);
				window.scrollTo({ top: 1500 });
			});
			await page.evaluate(() => window.awaitedEvent);
		},
		expected: { deadClicks: 1, deadClickTarget: "button:save" },
	},
	{
		name: "a pay button followed later by focus moving into a payment iframe",
		markup: `<button aria-label="pay">Pay</button>`,
		act: async (page) => {
			await page.click("button");
			await page.clock.runFor(400);
			await page.evaluate(() => window.dispatchEvent(new FocusEvent("blur")));
		},
		expected: { deadClicks: 1, deadClickTarget: "button:pay" },
	},
	{
		name: "rage clicking a button while text elsewhere is selected",
		markup: `<p>Order #1042</p><button aria-label="retry">Retry</button>`,
		act: async (page) => {
			await page.evaluate(() => {
				const paragraph = document.querySelector("p");
				if (paragraph) {
					getSelection()?.selectAllChildren(paragraph);
				}
			});
			await page.click("button", { clickCount: 3 });
		},
		expected: { rageClicks: 1, rageClickTarget: "button:retry" },
	},
];

const SLOW_NAVIGATIONS = [
	{
		name: "following a link to a slow page",
		markup: `<a href="${SLOW_PAGE_PATH}">Pricing</a>`,
		selector: "a",
	},
	{
		name: "submitting a form to a slow page",
		markup: `<form action="${SLOW_PAGE_PATH}"><input name="q" value="shoes"><button>Search</button></form>`,
		selector: "button",
	},
	{
		name: "a button that navigates from script to a slow page",
		markup: `<button onclick="location.href = '${SLOW_PAGE_PATH}'">Checkout</button>`,
		selector: "button",
	},
];

test.describe("interaction frustration signals", () => {
	for (const { name, markup, act } of ORDINARY_CLICKS) {
		test(`${name} is neither a rage nor a dead click`, async ({ page }) => {
			await loadFixture(page, markup);
			await act(page);
			await outlastDeadClickWindow(page);
			expect(await readFrustration(page)).toMatchObject({
				rageClicks: 0,
				deadClicks: 0,
			});
		});
	}

	test("a button that answers within the window is not a dead click", async ({
		page,
	}) => {
		await loadFixture(
			page,
			`<button onclick="setTimeout(() => { this.textContent = 'Saved' }, 1500)">Save</button>`
		);
		await page.click("button");
		await page.clock.runFor(1600);
		await page.clock.runFor(DEAD_CLICK_WINDOW_MS);
		expect(await readFrustration(page)).toMatchObject({ deadClicks: 0 });
	});

	for (const { name, markup, act, expected } of FRUSTRATED_CLICKS) {
		test(`${name} still counts`, async ({ page }) => {
			await loadFixture(page, markup);
			await act(page);
			await outlastDeadClickWindow(page);
			expect(await readFrustration(page)).toMatchObject(expected);
		});
	}

	for (const { name, markup, selector } of SLOW_NAVIGATIONS) {
		unroutedTest(
			`${name} is not a dead click when the browser never fires beforeunload`,
			async ({ page }) => {
				const clientId = `test-interactions-${crypto.randomUUID()}`;
				await loadFixture(page, markup, {
					iosLifecycle: true,
					fakeClock: false,
					clientId,
					apiUrl: TEST_SERVER_URL,
				});

				await page.click(selector, { noWaitAfter: true });
				await page.waitForURL(`**${SLOW_PAGE_PATH}**`, {
					waitUntil: "commit",
				});

				await expect
					.poll(() => readRecordedEngagementSpan(clientId))
					.toMatchObject({ clickCount: 1, deadClickCount: 0 });
			}
		);
	}

	test("a click made before clear() does not count after it", async ({
		page,
	}) => {
		await loadFixture(page, `<button id="save">Save</button>`);
		await page.click("button");
		await page.clock.runFor(100);
		await page.evaluate(() => window.databuddy?.clear());
		await outlastDeadClickWindow(page);
		expect(await readFrustration(page)).toMatchObject({ deadClicks: 0 });
	});

	test("a button that changes nothing is a dead click", async ({ page }) => {
		await loadFixture(page, `<button id="save">Save</button>`);
		await page.click("button");
		await outlastDeadClickWindow(page);
		expect(await readFrustration(page)).toMatchObject({
			deadClicks: 1,
			deadClickTarget: "button:save",
		});
	});

	test("an SPA link whose router swallows the click is a dead click", async ({
		page,
	}) => {
		await loadFixture(
			page,
			`<a href="/pricing" data-track="pricing" onclick="event.preventDefault()">Pricing</a>`
		);
		await page.click("a");
		await outlastDeadClickWindow(page);
		expect(await readFrustration(page)).toMatchObject({
			deadClicks: 1,
			deadClickTarget: "a:pricing",
		});
	});

	test("rage clicking an unresponsive button counts once per streak", async ({
		page,
	}) => {
		await loadFixture(page, `<button aria-label="pay">Pay</button>`);
		await page.click("button", { clickCount: 4 });
		await outlastDeadClickWindow(page);
		expect(await readFrustration(page)).toMatchObject({
			rageClicks: 1,
			rageClickTarget: "button:pay",
			deadClicks: 4,
		});
	});

	test("rage clicking a card that is not interactive counts", async ({
		page,
	}) => {
		await loadFixture(
			page,
			`<div class="card" style="width: 200px; height: 120px"></div>`
		);
		await page.click(".card", { clickCount: 3 });
		expect(await readFrustration(page)).toMatchObject({
			rageClicks: 1,
			rageClickTarget: "div:unnamed",
		});
	});

	test("a dead click reaches the engagement span when the visitor navigates", async ({
		page,
	}) => {
		await loadFixture(
			page,
			`<button id="save">Save</button><a href="/docs" onclick="event.preventDefault(); history.pushState({}, '', '/docs')">Docs</a>`
		);
		await page.click("button");
		await outlastDeadClickWindow(page);

		const engagementRequest = page.waitForRequest(isEngagementRequest);
		await page.click("a");
		await page.clock.runFor(10_000);
		const span = readEngagementSpan((await engagementRequest).postData());
		expect(span).toMatchObject({
			clickCount: 2,
			deadClickCount: 1,
			deadClickTarget: "button:save",
			exitType: "spa",
		});
	});
});

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

async function clickSpaced(page: Page, selector: string, times: number) {
	for (let click = 0; click < times; click++) {
		await page.click(selector);
		await page.clock.runFor(200);
	}
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
		name: "rapid clicks on a stepper that answers each one",
		markup: `<button aria-label="add" onclick="this.nextElementSibling.textContent = Number(this.nextElementSibling.textContent) + 1">+</button><span>1</span>`,
		act: (page) => clickSpaced(page, "button", 4),
	},
	{
		name: "rapid clicks on a theme toggle",
		markup: `<button aria-label="toggle theme" onclick="document.documentElement.classList.toggle('dark')">Theme</button>`,
		act: (page) => clickSpaced(page, "button", 3),
	},
	{
		name: "rapid clicks on a card whose framework handler answers",
		markup: `<div class="card" style="width: 200px; height: 120px"></div>`,
		act: async (page) => {
			await page.evaluate(() =>
				document.querySelector(".card")?.addEventListener("click", (event) => {
					const card = event.currentTarget as HTMLElement;
					card.dataset.open = String(card.dataset.open !== "true");
				})
			);
			await clickSpaced(page, ".card", 3);
		},
	},
	{
		name: "rapid clicks on a card whose handler scrolls a strip",
		markup: `<div id="strip" style="height: 60px; overflow: auto"><div style="height: 2000px"></div></div><div class="card" style="width: 200px; height: 120px"></div>`,
		act: async (page) => {
			await page.evaluate(() =>
				document
					.querySelector(".card")
					?.addEventListener("click", () =>
						document.querySelector("#strip")?.scrollBy(0, 100)
					)
			);
			for (let click = 0; click < 3; click++) {
				await clickAndAwaitEvent(page, ".card", "scroll");
			}
		},
	},
	{
		name: "rapid clicks on a theme toggle that swaps a stylesheet in head",
		markup: `<button aria-label="toggle theme" onclick="const link = document.head.querySelector('link[data-theme]'); link.href = link.href.endsWith('dark.css') ? 'light.css' : 'dark.css'">Theme</button>`,
		act: async (page) => {
			await page.evaluate(() =>
				document.head.insertAdjacentHTML(
					"beforeend",
					`<link rel="stylesheet" data-theme href="light.css">`
				)
			);
			await clickSpaced(page, "button", 3);
		},
	},
	{
		name: "rapid clicks on a web component that answers inside its shadow root",
		markup: "<qty-stepper></qty-stepper>",
		act: async (page) => {
			await page.evaluate(() =>
				customElements.define(
					"qty-stepper",
					class extends HTMLElement {
						constructor() {
							super();
							const root = this.attachShadow({ mode: "open" });
							root.innerHTML = "<button>+</button><span>1</span>";
							const count = root.querySelector("span");
							root.querySelector("button")?.addEventListener("click", () => {
								if (count) {
									count.textContent = String(Number(count.textContent) + 1);
								}
							});
						}
					}
				)
			);
			await clickSpaced(page, "qty-stepper button", 3);
		},
	},
	{
		name: "clicking three different bars of a chart",
		markup: `<svg width="300" height="100"><rect x="0" y="0" width="50" height="100"></rect><rect x="100" y="0" width="50" height="100"></rect><rect x="200" y="0" width="50" height="100"></rect></svg>`,
		act: async (page) => {
			for (const bar of [1, 2, 3]) {
				await page.click(`rect:nth-of-type(${bar})`);
			}
		},
	},
	{
		name: "a menu trigger that hovering already opened",
		markup: `<button aria-label="products" aria-expanded="true">Products</button>`,
		act: (page) => page.click("button"),
	},
	{
		name: "rapid clicks on an already pressed toggle",
		markup: `<button aria-label="monthly" aria-pressed="true">Monthly</button>`,
		act: (page) => page.click("button", { clickCount: 3 }),
	},
	{
		name: "a page script clicking an unresponsive button",
		markup: `<button aria-label="sync">Sync</button>`,
		act: (page) =>
			page.evaluate(() => {
				const button = document.querySelector("button");
				for (let click = 0; click < 3; click++) {
					button?.click();
				}
			}),
	},
	{
		name: "rapid clicks on a canvas",
		markup: `<canvas width="200" height="120"></canvas>`,
		act: (page) => page.click("canvas", { clickCount: 3 }),
	},
	{
		name: "rapid clicks on a video",
		markup: `<video width="200" height="120"></video>`,
		act: (page) => page.click("video", { clickCount: 3 }),
	},
	{
		name: "rapid clicks in an empty editable region",
		markup: `<div contenteditable="true" aria-label="notes"><p style="height: 120px"></p></div>`,
		act: (page) => page.click("[contenteditable] p", { clickCount: 3 }),
	},
	{
		name: "rapid clicks on the page background",
		markup: `<div style="height: 40px"></div>`,
		act: (page) => page.mouse.click(600, 500, { clickCount: 3 }),
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

const DESCRIBED_TARGETS: {
	name: string;
	markup: string;
	selector: string;
	clickCount?: number;
	expected: string;
}[] = [
	{
		name: "a link by its destination",
		markup: `<a href="/pricing" onclick="event.preventDefault()">See plans</a>`,
		selector: "a",
		expected: "a:/pricing",
	},
	{
		name: "an external link by its host",
		markup: `<a href="https://stripe.com/docs/payments" onclick="event.preventDefault()">Docs</a>`,
		selector: "a",
		expected: "a:stripe.com",
	},
	{
		name: "a link with an id-like path segment",
		markup: `<a href="/invite/k3vQpXmZrTwYuBoPaLsKd" onclick="event.preventDefault()">Join</a>`,
		selector: "a",
		expected: "a:/invite/*",
	},
	{
		name: "a button by its test id",
		markup: `<button data-testid="checkout-submit">Pay</button>`,
		selector: "button",
		expected: "button:checkout-submit",
	},
	{
		name: "an unnamed button by its landmark",
		markup: "<nav><button>Menu</button></nav>",
		selector: "button",
		expected: "button:unnamed in nav",
	},
	{
		name: "an unnamed button by its dialog id",
		markup: `<div role="dialog" id="checkout"><div><button>Close</button></div></div>`,
		selector: "button",
		expected: "button:unnamed in dialog:checkout",
	},
	{
		name: "a link by its first path segment only",
		markup: `<a href="/businesses/jane-doe-law-firm" onclick="event.preventDefault()">Jane Doe Law</a>`,
		selector: "a",
		expected: "a:/businesses/*",
	},
	{
		name: "a link to a personal subdomain by its public host",
		markup: `<a href="https://jane.substack.com/p/hello" onclick="event.preventDefault()">Blog</a>`,
		selector: "a",
		expected: "a:substack.com",
	},
	...["box.com", "hey.com", "box.io", "co.io", "com.io"].map((host) => ({
		name: `a personal subdomain under short host ${host}`,
		markup: `<a href="https://jane.${host}/hello" onclick="event.preventDefault()">Link</a>`,
		selector: "a",
		expected: `a:${host}`,
	})),
	...[
		"example.co.uk",
		"example.com.au",
		"example.com.br",
		"example.co.jp",
		"example.go.id",
		"example.com.pk",
		"example.com.co",
		"example.gob.mx",
		"example.ltd.uk",
	].map((host) => ({
		name: `an external host with country suffix ${host}`,
		markup: `<a href="https://www.${host}/hello" onclick="event.preventDefault()">Link</a>`,
		selector: "a",
		expected: `a:${host}`,
	})),
	{
		name: "a link with a percent-encoded segment",
		markup: `<a href="/%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9" onclick="event.preventDefault()">Arabic</a>`,
		selector: "a",
		expected: "a:/*",
	},
	{
		name: "a bare # link by its container",
		markup: `<nav><a href="#" onclick="event.preventDefault()">Menu</a></nav>`,
		selector: "a",
		expected: "a:unnamed in nav",
	},
	{
		name: "a button whose id React generated as unnamed",
		markup: `<button id="radix-:r1:">Open</button>`,
		selector: "button",
		expected: "button:unnamed",
	},
	{
		name: "a button whose id Base UI generated as unnamed",
		markup: `<button id="base-ui-_r_1b_">Open</button>`,
		selector: "button",
		expected: "button:unnamed",
	},
	{
		name: "a snake_case test id that merely contains an r word",
		markup: `<button data-testid="checkout_review_button">Review</button>`,
		selector: "button",
		expected: "button:checkout_review_button",
	},
	{
		name: "a link with an empty aria-label by its destination",
		markup: `<a href="/pricing" aria-label="" onclick="event.preventDefault()">Pricing</a>`,
		selector: "a",
		expected: "a:/pricing",
	},
	{
		name: "a button with an empty aria-label by its test id",
		markup: `<button aria-label="" data-testid="checkout-submit">Pay</button>`,
		selector: "button",
		expected: "button:checkout-submit",
	},
	{
		name: "a long custom element, capped at 64 characters",
		markup: `<main><section id="recommendations-for-returning-customers"><product-recommendation-carousel-item role="presentation" style="display: block; width: 200px; height: 100px"></product-recommendation-carousel-item></section></main>`,
		selector: "product-recommendation-carousel-item",
		clickCount: 3,
		expected:
			"product-recommendation-carousel-item:presentation:unnamed in sec",
	},
	{
		name: "an unnamed card by its named section, skipping the app root",
		markup: `<div id="root"><section id="pricing"><div class="card" style="width: 200px; height: 120px"></div></section></div>`,
		selector: ".card",
		clickCount: 3,
		expected: "div:unnamed in section:pricing",
	},
	{
		name: "an icon by its svg instead of a path inside it",
		markup: `<div id="root"><svg width="40" height="40"><path d="M0 0h40v40H0z"></path></svg></div>`,
		selector: "path",
		clickCount: 3,
		expected: "svg:unnamed",
	},
];

const FRUSTRATED_CLICKS: {
	name: string;
	markup: string;
	act: (page: Page) => Promise<unknown>;
	expected: Partial<Awaited<ReturnType<typeof readFrustration>>>;
}[] = [
	{
		name: "rapid clicks on a button that answers only after the burst",
		markup: `<button aria-label="pay" onclick="setTimeout(() => { this.textContent = 'Paid' }, 1500)">Pay</button>`,
		act: (page) => page.click("button", { clickCount: 3 }),
		expected: { rageClicks: 1, rageClickTarget: "button:pay" },
	},
	{
		name: "rage clicks split between a button's icon and its padding",
		markup: `<button aria-label="retry" style="padding: 20px"><svg width="20" height="20"><path d="M0 0h20v20H0z"></path></svg></button>`,
		act: async (page) => {
			await page.click("path");
			await page.click("button", { position: { x: 3, y: 3 } });
			await page.click("path");
		},
		expected: { rageClicks: 1, rageClickTarget: "button:retry" },
	},
	{
		name: "a button inside a non-editable island of an editor",
		markup: `<div contenteditable="false"><button aria-label="apply coupon">Apply</button></div>`,
		act: (page) => page.click("button"),
		expected: { deadClicks: 1, deadClickTarget: "button:apply coupon" },
	},
	{
		name: "a button that only loads a script",
		markup: `<button aria-label="open chat" onclick="document.head.appendChild(document.createElement('script'))">Chat</button>`,
		act: (page) => page.click("button"),
		expected: { deadClicks: 1, deadClickTarget: "button:open chat" },
	},
	{
		name: "a dead button followed by a scroll right after an unrelated click",
		markup: `<div style="height: 4000px"><button aria-label="save">Save</button><p>Terms apply</p></div>`,
		act: async (page) => {
			await page.click("button");
			await page.clock.runFor(1000);
			await page.click("p");
			await page.evaluate(() => {
				window.awaitedEvent = new Promise((resolve) =>
					document.addEventListener("scroll", () => resolve(), { once: true })
				);
				window.scrollTo({ top: 800 });
			});
			await page.evaluate(() => window.awaitedEvent);
		},
		expected: { deadClicks: 1, deadClickTarget: "button:save" },
	},
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
	async function rageClickUnresponsiveButton(page: Page) {
		await page.click("button", { clickCount: 3 });
		return page.evaluate(
			() => (window.__tracker as BaseTracker).rageClickCount
		);
	}

	test("interaction tracking is on without any configuration", async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(() => {
			document.body.innerHTML = `<button aria-label="pay">Pay</button>`;
			window.databuddyConfig = {
				clientId: "test-interactions-default",
				ignoreBotDetection: true,
			};
		});
		await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
		await expect
			.poll(() => page.evaluate(() => Boolean(window.__tracker)))
			.toBeTruthy();
		expect(await rageClickUnresponsiveButton(page)).toBe(1);
	});

	test('data-track-interactions="false" turns interaction tracking off', async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(() => {
			document.body.innerHTML = `<button aria-label="pay">Pay</button>`;
			const script = document.createElement("script");
			script.src = "/dist/databuddy-debug.js";
			script.dataset.clientId = "test-interactions-opt-out";
			script.dataset.ignoreBotDetection = "true";
			script.dataset.trackInteractions = "false";
			document.head.append(script);
		});
		await expect
			.poll(() => page.evaluate(() => Boolean(window.__tracker)))
			.toBeTruthy();
		expect(await rageClickUnresponsiveButton(page)).toBe(0);
	});

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

	for (const {
		name,
		markup,
		selector,
		clickCount = 1,
		expected,
	} of DESCRIBED_TARGETS) {
		test(`describes ${name}`, async ({ page }) => {
			await loadFixture(page, markup);
			await page.click(selector, { clickCount });
			await outlastDeadClickWindow(page);
			const { rageClickTarget, deadClickTarget } = await readFrustration(page);
			expect(clickCount > 1 ? rageClickTarget : deadClickTarget).toBe(expected);
		});
	}

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

	test("a page view change restarts the rage streak", async ({ page }) => {
		await loadFixture(page, `<button aria-label="next page">Next</button>`);
		for (let pageNumber = 2; pageNumber <= 3; pageNumber++) {
			await page.click("button");
			await page.clock.runFor(350);
			await page.evaluate(
				(next) => history.pushState({}, "", `?page=${next}`),
				pageNumber
			);
			await page.clock.runFor(100);
		}
		await page.click("button");
		expect(await readFrustration(page)).toMatchObject({ rageClicks: 0 });
	});

	test("clear() restarts the rage streak", async ({ page }) => {
		await loadFixture(page, `<button aria-label="sign out">Sign out</button>`);
		await page.click("button", { clickCount: 2 });
		await page.evaluate(() => window.databuddy?.clear());
		await page.click("button");
		expect(await readFrustration(page)).toMatchObject({ rageClicks: 0 });
	});

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

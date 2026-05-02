import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, findEvent, hasEvent, test } from "./test-utils";
import { generateSriHash } from "../deploy-utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");

function getScriptContent(): string {
	return readFileSync(join(DIST_DIR, "databuddy-debug.js"), "utf-8");
}

test.describe("Subresource Integrity (SRI)", () => {
	let validSriHash: string;

	test.beforeAll(async () => {
		validSriHash = await generateSriHash(getScriptContent());
	});

	test("script loads and initializes with valid SRI hash", async ({
		page,
	}) => {
		await page.goto("/test");
		await page.evaluate(
			({ sri }) => {
				(window as any).databuddyConfig = {
					clientId: "sri-test-client",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
				const script = document.createElement("script");
				script.src = "/dist/databuddy-debug.js";
				script.integrity = sri;
				script.crossOrigin = "anonymous";
				document.head.appendChild(script);
			},
			{ sri: validSriHash }
		);

		await expect
			.poll(
				async () => await page.evaluate(() => !!(window as any).databuddy)
			)
			.toBeTruthy();

		const tracker = await page.evaluate(
			() => (window as any).databuddy.options
		);
		expect(tracker.clientId).toBe("sri-test-client");
	});

	test("script sends events when loaded with valid SRI hash", async ({
		page,
	}) => {
		const requestPromise = page.waitForRequest(
			(req) =>
				req.url().includes("basket.databuddy.cc") &&
				req.method() === "POST" &&
				hasEvent(req, (e) => e.name === "screen_view")
		);

		await page.goto("/test");
		await page.evaluate(
			({ sri }) => {
				(window as any).databuddyConfig = {
					clientId: "sri-events-test",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
				const script = document.createElement("script");
				script.src = "/dist/databuddy-debug.js";
				script.integrity = sri;
				script.crossOrigin = "anonymous";
				document.head.appendChild(script);
			},
			{ sri: validSriHash }
		);

		const request = await requestPromise;
		const event = findEvent(request, (e) => e.name === "screen_view");
		expect(event).toBeTruthy();
		expect(event?.anonymousId).toBeTruthy();
	});

	test("script is blocked when SRI hash does not match", async ({ page }) => {
		const tampered =
			"sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(err.message));
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		await page.goto("/test");
		await page.evaluate(
			({ sri }) => {
				(window as any).databuddyConfig = {
					clientId: "sri-tampered-test",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
				const script = document.createElement("script");
				script.src = "/dist/databuddy-debug.js";
				script.integrity = sri;
				script.crossOrigin = "anonymous";
				document.head.appendChild(script);
			},
			{ sri: tampered }
		);

		await page.waitForTimeout(2000);

		const trackerLoaded = await page.evaluate(
			() => !!(window as any).databuddy
		);
		expect(trackerLoaded).toBe(false);
	});

	test("no analytics requests sent when SRI hash is invalid", async ({
		page,
	}) => {
		const tampered =
			"sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

		let basketRequestSent = false;
		page.on("request", (req) => {
			if (req.url().includes("basket.databuddy.cc")) {
				basketRequestSent = true;
			}
		});

		await page.goto("/test");
		await page.evaluate(
			({ sri }) => {
				(window as any).databuddyConfig = {
					clientId: "sri-no-events-test",
					ignoreBotDetection: true,
					batchTimeout: 200,
				};
				const script = document.createElement("script");
				script.src = "/dist/databuddy-debug.js";
				script.integrity = sri;
				script.crossOrigin = "anonymous";
				document.head.appendChild(script);
			},
			{ sri: tampered }
		);

		await page.waitForTimeout(2000);
		expect(basketRequestSent).toBe(false);
	});

	test("SRI hash is deterministic across multiple generations", async () => {
		const content = getScriptContent();
		const hash1 = await generateSriHash(content);
		const hash2 = await generateSriHash(content);
		const hash3 = await generateSriHash(content);
		expect(hash1).toBe(hash2);
		expect(hash2).toBe(hash3);
	});

	test("SRI hash changes when script content changes", async () => {
		const original = getScriptContent();
		const modified = `${original}\n// tampered`;
		const hash1 = await generateSriHash(original);
		const hash2 = await generateSriHash(modified);
		expect(hash1).not.toBe(hash2);
	});
});

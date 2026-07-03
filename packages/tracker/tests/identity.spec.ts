import type { Page, Request } from "@playwright/test";
import { expect, findEvent, test } from "./test-utils";

async function bootTracker(page: Page, clientId: string) {
	await page.goto("/test");
	await page.evaluate((id: string) => {
		(window as any).databuddyConfig = {
			clientId: id,
			ignoreBotDetection: true,
			batchTimeout: 200,
		};
	}, clientId);
	await page.addScriptTag({ url: "/dist/databuddy-debug.js" });
	await expect
		.poll(async () => await page.evaluate(() => !!(window as any).db))
		.toBeTruthy();
}

test.describe("Identity", () => {
	test("identify persists the profile id and sends an identify request", async ({
		page,
	}) => {
		await bootTracker(page, "test-identify");

		const identifyRequest = page.waitForRequest(
			(req: Request) =>
				req.url().includes("/identify") && req.method() === "POST"
		);

		await page.evaluate(() => {
			(window as any).db.identify("user_42", {
				email: "Jo@Acme.com",
				plan: "pro",
			});
		});

		const request = await identifyRequest;
		const payload = request.postDataJSON();
		expect(payload.profileId).toBe("user_42");
		expect(payload.anonymousId).toMatch(/^anon_/);
		expect(payload.traits).toEqual({ email: "Jo@Acme.com", plan: "pro" });

		const stored = await page.evaluate(() =>
			localStorage.getItem("did_profile")
		);
		expect(stored).toBe("user_42");
		const fromApi = await page.evaluate(() =>
			(window as any).db.getProfileId()
		);
		expect(fromApi).toBe("user_42");
	});

	test("events carry profileId after identify", async ({ page }) => {
		await bootTracker(page, "test-identify-events");

		await page.evaluate(() => {
			(window as any).db.identify("user_events");
		});

		const trackRequest = page.waitForRequest(
			(req: Request) =>
				req.url().includes("/track") &&
				Boolean(findEvent(req, (e) => e.name === "post_identify_event"))
		);
		await page.evaluate(() => {
			(window as any).db.track("post_identify_event");
		});

		const request = await trackRequest;
		const event = findEvent(
			request,
			(e) => e.name === "post_identify_event"
		) as Record<string, unknown>;
		expect(event.profileId).toBe("user_events");
	});

	test("clearProfile removes the stored profile id", async ({ page }) => {
		await bootTracker(page, "test-clear-profile");

		await page.evaluate(() => {
			(window as any).db.identify("user_gone");
			(window as any).db.clearProfile();
		});

		const stored = await page.evaluate(() =>
			localStorage.getItem("did_profile")
		);
		expect(stored).toBeNull();
		const fromApi = await page.evaluate(() =>
			(window as any).db.getProfileId()
		);
		expect(fromApi).toBeNull();
	});

	test("profile id survives reload", async ({ page }) => {
		await bootTracker(page, "test-profile-reload");

		await page.evaluate(() => {
			(window as any).db.identify("user_reload");
		});

		await bootTracker(page, "test-profile-reload");
		const fromApi = await page.evaluate(() =>
			(window as any).db.getProfileId()
		);
		expect(fromApi).toBe("user_reload");
	});

	test("repeat identify with the same id sends one request per session", async ({
		page,
	}) => {
		await bootTracker(page, "test-identify-dedupe");

		let identifyCount = 0;
		page.on("request", (req: Request) => {
			if (req.url().includes("/identify") && req.method() === "POST") {
				identifyCount++;
			}
		});

		const first = page.waitForRequest((req: Request) =>
			req.url().includes("/identify")
		);
		await page.evaluate(() => {
			(window as any).db.identify("user_dedupe");
		});
		await first;

		await page.evaluate(() => {
			(window as any).db.identify("user_dedupe");
		});
		await page.waitForTimeout(300);
		expect(identifyCount).toBe(1);

		const withTraits = page.waitForRequest((req: Request) =>
			req.url().includes("/identify")
		);
		await page.evaluate(() => {
			(window as any).db.identify("user_dedupe", { plan: "pro" });
		});
		await withTraits;
		expect(identifyCount).toBe(2);
	});

	test("identify rejects empty profile ids", async ({ page }) => {
		await bootTracker(page, "test-identify-empty");

		await page.evaluate(() => {
			(window as any).db.identify("   ");
		});

		const stored = await page.evaluate(() =>
			localStorage.getItem("did_profile")
		);
		expect(stored).toBeNull();
	});
});

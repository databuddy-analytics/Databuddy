import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TeamsProvider } from "../../providers/teams";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://outlook.office.com/webhook/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("TeamsProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats as Adaptive Card message", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.type).toBe("message");
		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
		expect(body.attachments[0].content.type).toBe("AdaptiveCard");
		expect(body.attachments[0].content.version).toBe("1.4");
	});

	test("card body contains title and message TextBlocks", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		expect(cardBody[0]).toMatchObject({
			type: "TextBlock",
			text: "Test Alert",
			size: "Large",
			weight: "Bolder",
		});
		expect(cardBody[1]).toMatchObject({
			type: "TextBlock",
			text: "Something happened",
		});
	});

	test("adds priority TextBlock with color for non-normal priority", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const priorityBlock = cardBody.find((b: { text?: string }) => b.text?.includes("URGENT"));
		expect(priorityBlock).toBeDefined();
		expect(priorityBlock.color).toBe("attention");
	});

	test("omits priority TextBlock for normal priority", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const priorityBlock = cardBody.find((b: { text?: string }) => b.text?.includes("Priority:"));
		expect(priorityBlock).toBeUndefined();
	});

	test("renders metadata as FactSet", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1", status: "critical" },
		});
		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const factSet = cardBody.find((b: { type: string }) => b.type === "FactSet");
		expect(factSet).toBeDefined();
		expect(factSet.facts).toEqual(
			expect.arrayContaining([
				{ title: "region", value: "us-east-1" },
				{ title: "status", value: "critical" },
			])
		);
	});

	test("returns success result on 200", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("teams");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 400, statusText: "Bad Request" }))
		) as typeof fetch;
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("400");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new TeamsProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});

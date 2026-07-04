import { describe, expect, it } from "bun:test";
import type { SlackAgentRun } from "@/agent/agent-client";
import { postChartImages } from "@/slack/chart-images";

const run: SlackAgentRun = {
	channelId: "C123",
	messageTs: "1.1",
	teamId: "T123",
	text: "traffic?",
	threadTs: "1.1",
	trigger: "app_mention",
	userId: "U123",
};

const chart = {
	type: "line-chart",
	title: "Sessions",
	series: ["Sessions"],
	rows: [
		["2026-07-01", 150],
		["2026-07-02", 141],
	],
};

const logger = { error: () => undefined, warn: () => undefined };

function fakeClient(uploadV2: (args: unknown) => Promise<{ ok: boolean }>) {
	return { files: { uploadV2 } } as never;
}

describe("postChartImages", () => {
	it("uploads rendered charts to the thread", async () => {
		const uploads: Record<string, unknown>[] = [];
		const client = fakeClient((args) => {
			uploads.push(args as Record<string, unknown>);
			return Promise.resolve({ ok: true });
		});
		const said: string[] = [];

		await postChartImages({
			charts: [chart],
			client,
			logger,
			run,
			say: (message) => {
				said.push(message.text);
				return Promise.resolve();
			},
		});

		expect(uploads).toHaveLength(1);
		expect(uploads[0]?.channel_id).toBe("C123");
		expect(uploads[0]?.thread_ts).toBe("1.1");
		expect(uploads[0]?.filename).toBe("sessions.png");
		expect(Buffer.isBuffer(uploads[0]?.file)).toBe(true);
		expect(said).toHaveLength(0);
	});

	it("falls back to markdown when the upload fails", async () => {
		const client = fakeClient(() => Promise.reject(new Error("missing_scope")));
		const said: string[] = [];

		await postChartImages({
			charts: [chart],
			client,
			logger,
			run,
			say: (message) => {
				said.push(message.text);
				return Promise.resolve();
			},
		});

		expect(said).toHaveLength(1);
		expect(said[0]).toContain("*Sessions*");
	});

	it("does nothing without charts", async () => {
		let uploads = 0;
		const client = fakeClient(() => {
			uploads++;
			return Promise.resolve({ ok: true });
		});

		await postChartImages({
			charts: [],
			client,
			logger,
			run,
			say: () => Promise.resolve(),
		});

		expect(uploads).toBe(0);
	});
});

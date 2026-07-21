import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock("evlog", () => ({ log: { error: state.error, warn: state.warn } }));
vi.mock("@/routes/webhooks/autumn", () => ({
	replayDeferredAutumnWebhooks: vi.fn(async () => ({
		completed: 0,
		deadLettered: 0,
		deferred: 0,
		failed: [],
	})),
}));
vi.mock("@/routes/webhooks/autumn-inbox", () => ({
	deleteCompletedAutumnWebhooks: vi.fn(async () => 0),
	deleteDeadLetterAutumnWebhooks: vi.fn(async () => 0),
	listUnalertedAutumnWebhookDeadLetters: vi.fn(async () => []),
	markAutumnWebhookDeadLettersAlerted: vi.fn(async () => 0),
}));

import { startAutumnWebhookReplayLoop } from "./autumn-webhook-replay";
import { runAutumnWebhookMaintenance } from "./autumn-webhook-replay";
import { replayDeferredAutumnWebhooks } from "@/routes/webhooks/autumn";
import {
	deleteCompletedAutumnWebhooks,
	deleteDeadLetterAutumnWebhooks,
	listUnalertedAutumnWebhookDeadLetters,
	markAutumnWebhookDeadLettersAlerted,
} from "@/routes/webhooks/autumn-inbox";

beforeEach(() => {
	vi.useFakeTimers();
	state.error.mockClear();
	state.warn.mockClear();
	vi.mocked(deleteCompletedAutumnWebhooks).mockClear();
	vi.mocked(deleteDeadLetterAutumnWebhooks).mockClear();
	vi.mocked(listUnalertedAutumnWebhookDeadLetters).mockClear();
	vi.mocked(markAutumnWebhookDeadLettersAlerted).mockClear();
	vi.mocked(replayDeferredAutumnWebhooks).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Autumn webhook replay loop", () => {
	it("runs bounded replay and retention maintenance in one shot", async () => {
		await expect(runAutumnWebhookMaintenance()).resolves.toEqual({
			completed: 0,
			deadLettered: 0,
			deadLetters: 0,
			deferred: 0,
			deleted: 0,
			failed: [],
		});
		expect(replayDeferredAutumnWebhooks).toHaveBeenCalledWith(100);
		expect(deleteCompletedAutumnWebhooks).toHaveBeenCalledWith({ limit: 100 });
		expect(deleteDeadLetterAutumnWebhooks).toHaveBeenCalledWith({ limit: 100 });
	});

	it("reports item-level replay failures that remain queued", async () => {
		vi.mocked(replayDeferredAutumnWebhooks).mockResolvedValueOnce({
			completed: 0,
			deadLettered: 0,
			deferred: 0,
			failed: ["msg-failed"],
		});

		await runAutumnWebhookMaintenance();

		expect(state.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				component: "autumn_webhook_replay",
				failed_count: 1,
			})
		);
	});

	it("alerts once for newly dead-lettered webhooks before retention", async () => {
		vi.mocked(listUnalertedAutumnWebhookDeadLetters).mockResolvedValueOnce([
			{
				attempts: 12,
				deadLetteredAt: new Date("2026-07-01T00:00:00.000Z"),
				errorMessage: "provider unavailable",
				id: "msg-dead",
				type: "balances.limit_reached",
			},
		]);

		await runAutumnWebhookMaintenance();

		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({
				component: "autumn_webhook_replay",
				dead_letter_count: 1,
				dead_letter_ids: ["msg-dead"],
			})
		);
		expect(markAutumnWebhookDeadLettersAlerted).toHaveBeenCalledWith([
			"msg-dead",
		]);
	});

	it("runs immediately, repeats every minute, and stops deterministically", async () => {
		const maintenance = vi.fn(async () => undefined);
		const loop = startAutumnWebhookReplayLoop(maintenance);

		await loop.run();
		expect(maintenance).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(maintenance).toHaveBeenCalledTimes(2);

		await loop.stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(maintenance).toHaveBeenCalledTimes(2);
	});

	it("waits for active maintenance before stopping", async () => {
		let finishMaintenance: (() => void) | undefined;
		const maintenance = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishMaintenance = resolve;
				})
		);
		const loop = startAutumnWebhookReplayLoop(maintenance);
		await vi.advanceTimersByTimeAsync(0);

		let stopped = false;
		const stop = loop.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);

		finishMaintenance?.();
		await stop;
		expect(stopped).toBe(true);

		await vi.advanceTimersByTimeAsync(120_000);
		expect(maintenance).toHaveBeenCalledTimes(1);
	});

	it("logs maintenance failures without rejecting or stopping the loop", async () => {
		const maintenance = vi.fn(async () => {
			throw new Error("database unavailable");
		});
		const loop = startAutumnWebhookReplayLoop(maintenance);

		await expect(loop.run()).resolves.toBeUndefined();
		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({
				component: "autumn_webhook_replay",
				error_message: "database unavailable",
			})
		);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(maintenance).toHaveBeenCalledTimes(2);
		await loop.stop();
	});
});

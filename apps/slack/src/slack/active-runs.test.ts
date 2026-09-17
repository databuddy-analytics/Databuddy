import { describe, expect, it } from "bun:test";
import {
	abortAllSlackActiveRuns,
	abortSlackActiveRun,
	abortSlackThreadRun,
	cleanupSlackActiveRun,
	registerSlackActiveRun,
} from "@/slack/active-runs";

describe("Slack active runs", () => {
	it("aborts a registered run by Slack message reference", () => {
		const controller = registerSlackActiveRun({
			channelId: "C123",
			messageTs: "171234.567",
			teamId: "T123",
			text: "What changed?",
			threadTs: "171234.567",
			trigger: "app_mention",
			userId: "U123",
		});

		expect(controller?.signal.aborted).toBe(false);
		expect(
			abortSlackActiveRun({
				channelId: "C123",
				messageTs: "171234.567",
				teamId: "T123",
			})
		).toBe(true);
		expect(controller?.signal.aborted).toBe(true);
	});
});

it("stops only the addressed thread without waiting for model output", () => {
	const run = {
		channelId: "C123",
		messageTs: "171234.567",
		teamId: "T123",
		text: "question",
		threadTs: "171234.000",
		trigger: "app_mention" as const,
		userId: "U123",
	};
	const other = { ...run, messageTs: "171234.777", threadTs: "171234.777" };
	const active = registerSlackActiveRun(run);
	const unrelated = registerSlackActiveRun(other);
	expect(
		abortSlackThreadRun({ ...run, messageTs: "171235.000", text: "stop" })
	).toBe(true);
	expect(active?.signal.aborted).toBe(true);
	expect(unrelated?.signal.aborted).toBe(false);
	expect(
		abortSlackThreadRun({ ...other, messageTs: "171234.600", text: "stop" })
	).toBe(false);
	expect(unrelated?.signal.aborted).toBe(false);
	cleanupSlackActiveRun(run);
	cleanupSlackActiveRun(other);
});

it("preserves shutdown control while a deleted response is cleaning up", () => {
	const run = {
		channelId: "C_DELETE",
		messageTs: "123.1",
		teamId: "T1",
		text: "question",
		threadTs: "123.0",
		trigger: "app_mention" as const,
		userId: "U1",
	};
	const controller = new AbortController();
	const shutdown = new AbortController();
	registerSlackActiveRun(run, controller, shutdown);
	abortSlackActiveRun({
		channelId: run.channelId,
		messageTs: run.messageTs,
		teamId: run.teamId,
	});
	abortAllSlackActiveRuns("shutdown");
	expect(controller.signal.aborted).toBe(true);
	expect(shutdown.signal.reason).toBe("shutdown");
});

import { log } from "evlog";
import {
	deleteCompletedAutumnWebhooks,
	deleteDeadLetterAutumnWebhooks,
	listUnalertedAutumnWebhookDeadLetters,
	markAutumnWebhookDeadLettersAlerted,
} from "@/routes/webhooks/autumn-inbox";
import { replayDeferredAutumnWebhooks } from "@/routes/webhooks/autumn";

const REPLAY_INTERVAL_MS = 60_000;
const REPLAY_BATCH_SIZE = 100;

export interface AutumnWebhookReplayLoop {
	run(): Promise<void>;
	stop(): void;
}

export async function runAutumnWebhookMaintenance(): Promise<{
	completed: number;
	deadLettered: number;
	deadLetters: number;
	deferred: number;
	deleted: number;
	failed: string[];
}> {
	const replay = await replayDeferredAutumnWebhooks(REPLAY_BATCH_SIZE);
	if (replay.failed.length > 0) {
		log.warn({
			service: "api",
			component: "autumn_webhook_replay",
			message: "Autumn webhook replay batch had failures",
			failed_count: replay.failed.length,
		});
	}

	const deadLetters = await listUnalertedAutumnWebhookDeadLetters({
		limit: REPLAY_BATCH_SIZE,
	});
	if (deadLetters.length > 0) {
		log.error({
			service: "api",
			component: "autumn_webhook_replay",
			dead_letter_count: deadLetters.length,
			dead_letter_ids: deadLetters.map((row) => row.id),
			error_message: "Autumn webhooks exhausted replay attempts",
		});
		await markAutumnWebhookDeadLettersAlerted(deadLetters.map((row) => row.id));
	}

	const deletedRows = await Promise.all([
		deleteCompletedAutumnWebhooks({ limit: REPLAY_BATCH_SIZE }),
		deleteDeadLetterAutumnWebhooks({ limit: REPLAY_BATCH_SIZE }),
	]);
	return {
		...replay,
		deadLetters: deadLetters.length,
		deleted: deletedRows.reduce((total, count) => total + count, 0),
	};
}

export function startAutumnWebhookReplayLoop(
	maintenance: () => Promise<unknown> = runAutumnWebhookMaintenance
): AutumnWebhookReplayLoop {
	let active: Promise<void> | null = null;
	let stopped = false;

	const run = (): Promise<void> => {
		if (stopped) {
			return Promise.resolve();
		}
		if (active) {
			return active;
		}
		active = Promise.resolve()
			.then(maintenance)
			.then(() => undefined)
			.catch((error) => {
				log.error({
					service: "api",
					component: "autumn_webhook_replay",
					error_message: error instanceof Error ? error.message : String(error),
				});
			})
			.finally(() => {
				active = null;
			});
		return active;
	};

	run().catch(() => undefined);
	const timer = setInterval(() => {
		run().catch(() => undefined);
	}, REPLAY_INTERVAL_MS);
	timer.unref?.();

	return {
		run,
		stop: () => {
			stopped = true;
			clearInterval(timer);
		},
	};
}

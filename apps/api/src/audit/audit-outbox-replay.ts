import { replayAuditOutbox } from "@databuddy/services/audit";
import { db } from "@databuddy/db";
import { log } from "evlog";

const REPLAY_INTERVAL_MS = 60_000;

export interface AuditOutboxReplayLoop {
	run(): Promise<void>;
	stop(): Promise<void>;
}

export function startAuditOutboxReplayLoop(): AuditOutboxReplayLoop {
	let active: Promise<void> | null = null;
	let stopped = false;

	const run = (): Promise<void> => {
		if (stopped) {
			return Promise.resolve();
		}
		if (active) {
			return active;
		}
		active = replayAuditOutbox(db)
			.then(() => undefined)
			.catch((error) => {
				log.error({
					service: "api",
					component: "audit_outbox_replay",
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
		stop: async () => {
			stopped = true;
			clearInterval(timer);
			await active;
		},
	};
}

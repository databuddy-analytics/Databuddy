import "@databuddy/test/env";

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import { autumnWebhookEvents } from "@databuddy/db/schema";
import { hasTestDb } from "@databuddy/test";
import {
	AUTUMN_WEBHOOK_MAX_ATTEMPTS,
	autumnWebhookRetryDelayMs,
	claimAutumnWebhook,
	deleteCompletedAutumnWebhooks,
	deleteDeadLetterAutumnWebhooks,
	getAutumnWebhook,
	listReplayableAutumnWebhookIds,
	listUnalertedAutumnWebhookDeadLetters,
	markAutumnWebhookDeadLettersAlerted,
	recordAutumnWebhookAttempt,
	storeAutumnWebhook,
} from "../routes/webhooks/autumn-inbox";

const iit = hasTestDb ? it : it.skip;
const ids = new Set<string>();

function webhookId(label: string): string {
	const id = `test-autumn-${label}-${crypto.randomUUID()}`;
	ids.add(id);
	return id;
}

async function store(id: string): Promise<void> {
	await storeAutumnWebhook({
		id,
		payload: {
			customer_id: "user-example",
			feature_id: "events",
			limit_type: "included",
		},
		type: "balances.limit_reached",
	});
}

afterEach(async () => {
	if (ids.size > 0) {
		await db
			.delete(autumnWebhookEvents)
			.where(inArray(autumnWebhookEvents.id, [...ids]));
		ids.clear();
	}
});

afterAll(() => shutdownPostgres());

describe("Autumn webhook inbox", () => {
	iit("keeps the first payload and moves one claim through replay states", async () => {
		const id = webhookId("lifecycle");
		const first = await storeAutumnWebhook({
			id,
			payload: {
				customer_id: "user-example",
				feature_id: "events",
				limit_type: "included",
			},
			type: "balances.limit_reached",
		});
		const duplicate = await storeAutumnWebhook({
			id,
			payload: { customer_id: "different-customer" },
			type: "balances.usage_alert_triggered",
		});

		expect(first).toEqual(duplicate);
		expect(duplicate.type).toBe("balances.limit_reached");
		expect(duplicate.payload).toEqual({
			customer_id: "user-example",
			feature_id: "events",
			limit_type: "included",
		});

		const firstClaim = await claimAutumnWebhook({ id });
		expect(firstClaim).not.toBeNull();
		await recordAutumnWebhookAttempt({
			attempts: firstClaim!.attempts,
			claimToken: firstClaim!.claimToken,
			errorMessage: "organization could not be resolved",
			id,
			status: "deferred",
		});

		const replayAt = new Date(Date.now() + 7 * 60 * 60 * 1000);
		expect(
			await listReplayableAutumnWebhookIds({ now: replayAt })
		).toContain(id);
		const replayClaim = await claimAutumnWebhook({ id, now: replayAt });
		expect(replayClaim).not.toBeNull();
		await recordAutumnWebhookAttempt({
			attempts: replayClaim!.attempts,
			claimToken: replayClaim!.claimToken,
			id,
			now: replayAt,
			status: "completed",
		});

		expect(await listReplayableAutumnWebhookIds({ now: replayAt })).not.toContain(
			id
		);
		expect((await getAutumnWebhook(id))?.status).toBe("completed");

		const [row] = await db
			.select({
				attempts: autumnWebhookEvents.attempts,
				completedAt: autumnWebhookEvents.completedAt,
				errorMessage: autumnWebhookEvents.errorMessage,
			})
			.from(autumnWebhookEvents)
			.where(eq(autumnWebhookEvents.id, id));
		expect(row).toEqual({
			attempts: 2,
			completedAt: replayAt,
			errorMessage: null,
		});
	});

	iit("allows one claim and keeps both completion orders terminal", async () => {
		const completedId = webhookId("concurrent-completed");
		const failedId = webhookId("concurrent-failed");
		await store(completedId);
		await store(failedId);
		const claims = await Promise.all(
			Array.from({ length: 8 }, () => claimAutumnWebhook({ id: completedId }))
		);
		const claim = claims.find((row) => row !== null);
		expect(claims.filter((row) => row !== null)).toHaveLength(1);
		expect(claim).toBeDefined();

		await recordAutumnWebhookAttempt({
			attempts: claim!.attempts,
			claimToken: claim!.claimToken,
			id: completedId,
			status: "completed",
		});
		await recordAutumnWebhookAttempt({
			attempts: claim!.attempts,
			claimToken: claim!.claimToken,
			errorMessage: "late worker failure",
			id: completedId,
			status: "pending",
		});
		expect((await getAutumnWebhook(completedId))?.status).toBe("completed");

		const failedClaim = await claimAutumnWebhook({ id: failedId });
		expect(failedClaim).not.toBeNull();
		await recordAutumnWebhookAttempt({
			attempts: failedClaim!.attempts,
			claimToken: failedClaim!.claimToken,
			errorMessage: "provider failed",
			id: failedId,
			status: "pending",
		});
		await recordAutumnWebhookAttempt({
			attempts: failedClaim!.attempts,
			claimToken: failedClaim!.claimToken,
			id: failedId,
			status: "completed",
		});
		expect((await getAutumnWebhook(failedId))?.status).toBe("pending");
	});

	iit("bounds retry delay and retains alerted dead letters for audit", async () => {
		expect(autumnWebhookRetryDelayMs(1)).toBe(5 * 60 * 1000);
		expect(autumnWebhookRetryDelayMs(100)).toBe(6 * 60 * 60 * 1000);

		const oldId = webhookId("dead-old");
		const recentId = webhookId("dead-recent");
		const unalertedId = webhookId("dead-unalerted");
		for (const id of [oldId, recentId, unalertedId]) {
			await store(id);
			await db
				.update(autumnWebhookEvents)
				.set({ attempts: AUTUMN_WEBHOOK_MAX_ATTEMPTS - 1 })
				.where(eq(autumnWebhookEvents.id, id));
			const claim = await claimAutumnWebhook({ id });
			expect(claim).not.toBeNull();
			expect(
				await recordAutumnWebhookAttempt({
					attempts: claim!.attempts,
					claimToken: claim!.claimToken,
					errorMessage: "provider unavailable",
					id,
					status: "pending",
				})
			).toBe("dead_letter");
		}

		const selected = await listUnalertedAutumnWebhookDeadLetters();
		expect(selected.map((row) => row.id)).toEqual(
			expect.arrayContaining([oldId, recentId, unalertedId])
		);
		await markAutumnWebhookDeadLettersAlerted([oldId, recentId]);
		expect(
			(await listUnalertedAutumnWebhookDeadLetters()).map((row) => row.id)
		).toContain(unalertedId);

		const now = new Date();
		const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
		const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
		await db
			.update(autumnWebhookEvents)
			.set({ deadLetteredAt: old })
			.where(inArray(autumnWebhookEvents.id, [oldId, unalertedId]));

		expect(await deleteDeadLetterAutumnWebhooks({ olderThan: cutoff })).toBe(1);
		expect(await getAutumnWebhook(oldId)).toBeNull();
		expect(await getAutumnWebhook(recentId)).not.toBeNull();
		expect(await getAutumnWebhook(unalertedId)).not.toBeNull();
	});

	iit("deletes only completed rows older than the retention window", async () => {
		const oldId = webhookId("completed-old");
		const recentId = webhookId("completed-recent");
		const pendingId = webhookId("completed-pending");
		for (const id of [oldId, recentId, pendingId]) {
			await store(id);
		}
		for (const id of [oldId, recentId]) {
			const claim = await claimAutumnWebhook({ id });
			expect(claim).not.toBeNull();
			await recordAutumnWebhookAttempt({
				attempts: claim!.attempts,
				claimToken: claim!.claimToken,
				id,
				status: "completed",
			});
		}

		const now = new Date();
		const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
		const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		await db
			.update(autumnWebhookEvents)
			.set({ completedAt: old })
			.where(inArray(autumnWebhookEvents.id, [oldId, pendingId]));

		expect(await deleteCompletedAutumnWebhooks({ olderThan: cutoff })).toBe(1);
		expect(await getAutumnWebhook(oldId)).toBeNull();
		expect(await getAutumnWebhook(recentId)).not.toBeNull();
		expect(await getAutumnWebhook(pendingId)).not.toBeNull();
	});
});

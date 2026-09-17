import { describe, expect, it } from "bun:test";
import type { SlackAgentRun } from "@/agent/agent-client";
import { SlackThreadQueue } from "@/slack/thread-queue";

function createRun(overrides: Partial<SlackAgentRun> = {}): SlackAgentRun {
	return {
		channelId: "C123",
		messageTs: "171234.567",
		teamId: "T123",
		text: "What changed?",
		threadTs: "171234.000",
		trigger: "app_mention",
		userId: "U123",
		...overrides,
	};
}

function createFakeRedis() {
	const values = new Map<string, string>();
	const lists = new Map<string, string[]>();
	const expiries = new Map<string, number>();

	return {
		values,
		lists,
		expiries,
		advance(seconds: number) {
			for (const [key, remaining] of expiries) {
				if (remaining <= seconds) {
					values.delete(key);
					lists.delete(key);
					expiries.delete(key);
				} else {
					expiries.set(key, remaining - seconds);
				}
			}
		},
		async del(...keys: string[]) {
			let deleted = 0;
			for (const key of keys) {
				if (values.delete(key)) {
					deleted++;
				}
				lists.delete(key);
				expiries.delete(key);
			}
			return deleted;
		},
		async eval(
			script: string,
			_keyCount: number,
			first: string,
			second: string,
			...args: string[]
		) {
			if (script.includes("local stoppedAt")) {
				const stoppedAt = values.get(second);
				if (stoppedAt && Number(args[3]) <= Number(stoppedAt)) return [-1, 0];
				const pending = lists.get(first) ?? [];
				if (pending.length >= Number(args[1])) return [0, pending.length];
				pending.push(args[0]!);
				lists.set(first, pending);
				expiries.set(first, Number(args[2]));
				return [1, pending.length];
			}
			if (script.includes("local result = {}")) {
				if (values.get(args[0]!) !== args[1])
					throw new Error("Slack thread lock expired");
				expiries.set(args[0]!, Number(args[2]));
				const pending = lists.get(first) ?? [];
				const result: string[] = [];
				let author: string | undefined;
				while (pending.length) {
					const raw = pending[0];
					if (!raw) break;
					const item = JSON.parse(raw) as {
						messageTs: string;
						requestTs?: string;
						userId: string;
					};
					if (
						Number(item.requestTs ?? item.messageTs) >
						Number(values.get(second) ?? 0)
					) {
						if (result.length && item.userId !== author) break;
						author = item.userId;
						result.push(raw);
					}
					pending.shift();
				}
				return result;
			}
			if (script.includes("local previous")) {
				const cutoff = Math.max(
					Number(args[0]),
					Number(values.get(second) ?? 0)
				);
				values.set(second, String(cutoff));
				lists.set(
					first,
					(lists.get(first) ?? []).filter(
						(raw) =>
							Number(JSON.parse(raw).requestTs ?? JSON.parse(raw).messageTs) >
							cutoff
					)
				);
				expiries.set(first, Number(args[1]));
				expiries.set(second, Number(args[1]));
				return 1;
			}
			if (script.includes("return redis.call('EXPIRE'")) {
				if (values.get(first) !== second) return 0;
				expiries.set(first, Number(args[0]));
				return 1;
			}
			if (values.get(first) !== args[0]) return 1;
			if (args[1] === "true" && (lists.get(second)?.length ?? 0) > 0) return 0;
			values.delete(first);
			return 1;
		},
		async expire(key: string, seconds: number) {
			expiries.set(key, seconds);
			return 1;
		},
		async get(key: string) {
			return values.get(key) ?? null;
		},
		async lrange(key: string) {
			return [...(lists.get(key) ?? [])];
		},
		async llen(key: string) {
			return lists.get(key)?.length ?? 0;
		},
		async lrem(key: string, count: number, item: string) {
			const list = lists.get(key) ?? [];
			let removed = 0;
			const next: string[] = [];
			for (const entry of list) {
				if (entry === item && removed < count) {
					removed++;
					continue;
				}
				next.push(entry);
			}
			lists.set(key, next);
			return removed;
		},
		async ltrim(key: string, start: number, stop: number) {
			const list = lists.get(key) ?? [];
			lists.set(key, list.slice(start, stop === -1 ? undefined : stop + 1));
			return "OK";
		},
		async rpush(key: string, ...items: string[]) {
			const list = lists.get(key) ?? [];
			list.push(...items);
			lists.set(key, list);
			return list.length;
		},
		async set(
			key: string,
			value: string,
			exMode?: "EX",
			seconds?: number,
			nxMode?: "NX"
		) {
			if (nxMode === "NX" && values.has(key)) {
				return null;
			}
			values.set(key, value);
			if (exMode === "EX" && typeof seconds === "number") {
				expiries.set(key, seconds);
			}
			return "OK" as const;
		},
	};
}

describe("SlackThreadQueue", () => {
	it("allows only one active run per Slack thread", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();

		expect(await queue.tryAcquire(run)).toBe(true);
		expect(await queue.tryAcquire(run)).toBe(false);

		await queue.release(run);
		expect(await queue.tryAcquire(run)).toBe(true);
	});

	it("queues and drains follow-up messages for a thread", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);

		await queue.enqueue(
			createRun({ messageTs: "171234.568", text: "also referrers" })
		);
		await queue.enqueue(
			createRun({ messageTs: "171234.569", text: "and campaigns" })
		);

		expect(await queue.drain(run)).toEqual([
			{ messageTs: "171234.568", text: "also referrers", userId: "U123" },
			{ messageTs: "171234.569", text: "and campaigns", userId: "U123" },
		]);
		expect(await queue.drain(run)).toEqual([]);
	});

	it("tracks threads Databuddy has already joined", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();

		expect(await queue.isEngaged(run)).toBe(false);
		await queue.markEngaged(run);
		expect(await queue.isEngaged(run)).toBe(true);
	});

	it("caps queued follow-up bursts", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);
		let lastResult: Awaited<ReturnType<typeof queue.enqueue>> | undefined;

		for (let index = 0; index < 11; index++) {
			lastResult = await queue.enqueue(
				createRun({
					messageTs: `171234.${570 + index}`,
					text: `follow-up ${index}`,
				})
			);
		}

		expect(lastResult).toEqual({
			ok: false,
			queuedCount: 10,
			reason: "queue_full",
			truncated: false,
		});
		expect((await queue.drain(run)).length).toBe(10);
	});

	it("truncates very long queued follow-ups", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);

		const result = await queue.enqueue(createRun({ text: "x".repeat(5000) }));
		const [followUp] = await queue.drain(run);

		expect(result).toMatchObject({ ok: true, truncated: true });
		expect(followUp?.text.length).toBe(4000);
	});

	it("removes a queued follow-up when Slack deletes the source message", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);

		await queue.enqueue(createRun({ messageTs: "171234.568", text: "keep" }));
		await queue.enqueue(createRun({ messageTs: "171234.569", text: "delete" }));

		expect(
			await queue.removeDeletedFollowUp({
				channelId: "C123",
				messageTs: "171234.569",
				teamId: "T123",
			})
		).toBe(true);

		expect(await queue.drain(run)).toEqual([
			{ messageTs: "171234.568", text: "keep", userId: "U123" },
		]);
	});
});

describe("Slack queue safety", () => {
	it("retains queued authors and deletion references across slow responses", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);
		for (let index = 0; index < 10; index++) {
			await queue.enqueue(
				createRun({
					messageTs: `171235.${index}`,
					text: `message ${index}`,
					userId: `U${index}`,
				})
			);
		}
		for (let index = 0; index < 9; index++) {
			redis.advance(4 * 60);
			expect((await queue.drain(run)).map((item) => item.text)).toEqual([
				`message ${index}`,
			]);
		}
		expect(
			await queue.removeDeletedFollowUp({
				channelId: run.channelId,
				messageTs: "171235.9",
				teamId: run.teamId,
			})
		).toBe(true);
		expect(await queue.drain(run)).toEqual([]);
	});

	it("keeps the stop cutoff and preserved follow-ups beyond one response lease", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);
		await queue.enqueue(createRun({ messageTs: "171235.000", text: "keep" }));
		await queue.stop(createRun({ messageTs: "171234.900" }));
		redis.advance(4 * 60);
		expect(await queue.renew(run)).toBe(true);
		redis.advance(4 * 60);
		expect(await queue.isStopped(run)).toBe(true);
		expect((await queue.drain(run)).map((item) => item.text)).toEqual(["keep"]);
	});

	it("keeps concurrent enqueue attempts within the shared capacity", async () => {
		const redis = createFakeRedis();
		const replicas = [new SlackThreadQueue(redis), new SlackThreadQueue(redis)];
		const results = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				replicas[index % 2]!.enqueue(
					createRun({
						messageTs: `171234.${570 + index}`,
						text: `message ${index}`,
					})
				)
			)
		);
		expect(results.filter((result) => result.ok)).toHaveLength(10);
		expect(
			results.filter((result) => result.reason === "queue_full")
		).toHaveLength(10);
	});

	it("prevents an expired owner from consuming a replacement owner's queued messages", async () => {
		const redis = createFakeRedis();
		const expired = new SlackThreadQueue(redis);
		const previousRun = createRun();
		await expired.tryAcquire(previousRun);
		redis.values.clear();
		const replacement = new SlackThreadQueue(redis);
		const currentRun = createRun();
		await replacement.tryAcquire(currentRun);
		await replacement.enqueue(
			createRun({ text: "belongs to the current owner" })
		);

		await expect(expired.drain(previousRun)).rejects.toThrow("lock");
		expect((await replacement.drain(currentRun))[0]?.text).toBe(
			"belongs to the current owner"
		);
	});

	it("keeps consecutive authors together in arrival order", async () => {
		const queue = new SlackThreadQueue(createFakeRedis());
		const run = createRun();
		await queue.tryAcquire(run);
		for (const [index, userId] of ["A", "A", "B", "A"].entries()) {
			await queue.enqueue(createRun({ userId, text: `message ${index}` }));
		}
		expect((await queue.drain(run)).map((item) => item.text)).toEqual([
			"message 0",
			"message 1",
		]);
		expect((await queue.drain(run)).map((item) => item.userId)).toEqual(["B"]);
		expect((await queue.drain(run)).map((item) => item.userId)).toEqual(["A"]);
	});

	it("fails closed when Redis is unavailable or lock acquisition fails", async () => {
		await expect(
			new SlackThreadQueue(null).tryAcquire(createRun())
		).rejects.toThrow("unavailable");
		const redis = createFakeRedis();
		redis.set = async () => {
			throw new Error("Redis unavailable");
		};
		await expect(
			new SlackThreadQueue(redis).tryAcquire(createRun())
		).rejects.toThrow("unavailable");
	});

	it("keeps the lock for a late follow-up and never releases a replacement owner", async () => {
		const redis = createFakeRedis();
		const queue = new SlackThreadQueue(redis);
		const run = createRun();
		await queue.tryAcquire(run);
		expect(await queue.drain(run)).toEqual([]);
		await queue.enqueue(createRun({ text: "late message" }));
		expect(await queue.release(run, true)).toBe(false);
		expect((await queue.drain(run))[0]?.text).toBe("late message");
		redis.values.clear(); // Simulate lease expiry and another replica acquiring it.
		const replacement = new SlackThreadQueue(redis);
		const next = createRun();
		expect(await replacement.tryAcquire(next)).toBe(true);
		await queue.release(run);
		expect(await queue.tryAcquire(run)).toBe(false);
		await replacement.release(next);
	});

	it("shares stop state across replicas, clears pending work, and allows later messages", async () => {
		const redis = createFakeRedis();
		const running = new SlackThreadQueue(redis);
		const otherReplica = new SlackThreadQueue(redis);
		const run = createRun();
		await running.tryAcquire(run);
		await running.enqueue(createRun());
		await otherReplica.stop(
			createRun({ messageTs: "171234.900", text: "stop" })
		);
		expect(await running.isStopped(createRun())).toBe(true);
		expect(await running.drain(run)).toEqual([]);
		expect(
			await running.isStopped(createRun({ messageTs: "171235.000" }))
		).toBe(false);
	});
});

it("allows a new click on an old card after stop, including when queued", async () => {
	const queue = new SlackThreadQueue(createFakeRedis());
	const run = createRun();
	await queue.tryAcquire(run);
	await queue.stop(createRun({ messageTs: "171234.800" }));
	const click = createRun({
		messageTs: "171234.100",
		requestTs: "171234.900",
		text: "new click",
	});
	expect(await queue.isStopped(click)).toBe(false);
	expect((await queue.enqueue(click)).ok).toBe(true);
	expect((await queue.drain(run))[0]?.requestTs).toBe("171234.900");
});

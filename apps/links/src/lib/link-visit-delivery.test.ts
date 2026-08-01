import { describe, expect, mock, test } from "bun:test";
import {
	addLinkVisitJob,
	getWorkerConcurrency,
	getLinkVisitRetryDelay,
	KAFKA_ATTEMPTED_FIELD,
	LINK_VISIT_JOB_OPTIONS,
	LINK_VISIT_JOB_NAME,
	processLinkVisitJob,
} from "./link-visit-delivery";
import type { LinkVisitEvent } from "./producer";

const event: LinkVisitEvent = {
	browser_name: "Chrome",
	city: null,
	country: "US",
	device_type: "desktop",
	id: "1b0a8d41-1d8a-4c31-91e0-4b4fcb2d8b0d",
	ip_hash: "hash_123",
	link_id: "link_123",
	referrer: null,
	region: null,
	timestamp: "2026-05-07 12:00:00.000",
	user_agent: "Mozilla/5.0",
};

describe("link visit durable delivery", () => {
	const makeJob = (data = event, name = LINK_VISIT_JOB_NAME) => ({
		data,
		name,
		updateData: mock(() => Promise.resolve()),
	});

	test("uses the immutable event id as the BullMQ job id", async () => {
		const add = mock(() => Promise.resolve({}));

		await addLinkVisitJob({ add }, event);

		expect(add).toHaveBeenCalledWith(LINK_VISIT_JOB_NAME, event, {
			jobId: event.id,
		});
	});

	test("retries the same payload when Kafka does not acknowledge it", async () => {
		const deliver = mock(() => Promise.resolve(false));

		await expect(
			processLinkVisitJob(makeJob(), deliver)
		).rejects.toThrow("not acknowledged");
		expect(deliver).toHaveBeenCalledWith(
			event,
			event.link_id,
			expect.objectContaining({
				allowDirectFallback: true,
				beforeKafkaSend: expect.any(Function),
			})
		);
	});

	test("completes only after Kafka acknowledges the immutable payload", async () => {
		const deliver = mock(() => Promise.resolve(true));

		await processLinkVisitJob(makeJob(), deliver);

		expect(deliver).toHaveBeenCalledWith(
			event,
			event.link_id,
			expect.objectContaining({ allowDirectFallback: true })
		);
	});

	test("rejects unknown job names", async () => {
		await expect(
			processLinkVisitJob(makeJob(event, "unknown"))
		).rejects.toThrow("Unknown link visit job");
	});

	test("persists the Kafka-attempt marker before sending", async () => {
		const job = makeJob();
		const deliver = mock(
			async (
				_event: LinkVisitEvent,
				_key?: string,
				options?: { beforeKafkaSend?: () => Promise<void> }
			) => {
				await options?.beforeKafkaSend?.();
				return false;
			}
		);

		await expect(processLinkVisitJob(job, deliver)).rejects.toThrow(
			"not acknowledged"
		);

		expect(job.updateData).toHaveBeenCalledWith({
			...event,
			[KAFKA_ATTEMPTED_FIELD]: true,
		});
	});

	test("blocks direct fallback only for the job that already attempted Kafka", async () => {
		const job = makeJob({
			...event,
			[KAFKA_ATTEMPTED_FIELD]: true as const,
		});
		const deliver = mock(() => Promise.resolve(false));

		await expect(processLinkVisitJob(job, deliver)).rejects.toThrow(
			"not acknowledged"
		);

		expect(deliver).toHaveBeenCalledWith(
			event,
			event.link_id,
			expect.objectContaining({ allowDirectFallback: false })
		);
		expect(job.updateData).not.toHaveBeenCalled();
	});

	test("caps retry delays at one minute", () => {
		expect(getLinkVisitRetryDelay(1)).toBe(1000);
		expect(getLinkVisitRetryDelay(6)).toBe(32_000);
		expect(getLinkVisitRetryDelay(7)).toBe(60_000);
		expect(getLinkVisitRetryDelay(20)).toBe(60_000);
	});

	test("bounds failed-job retention", () => {
		expect(LINK_VISIT_JOB_OPTIONS.removeOnFail).toEqual({
			age: 7 * 24 * 3600,
			count: 100_000,
		});
	});

	test("requires full integer worker concurrency values", () => {
		const previous = process.env.LINK_VISIT_WORKER_CONCURRENCY;
		try {
			process.env.LINK_VISIT_WORKER_CONCURRENCY = "4";
			expect(getWorkerConcurrency()).toBe(4);
			process.env.LINK_VISIT_WORKER_CONCURRENCY = "3.5";
			expect(getWorkerConcurrency()).toBe(2);
			process.env.LINK_VISIT_WORKER_CONCURRENCY = "4oops";
			expect(getWorkerConcurrency()).toBe(2);
		} finally {
			if (previous === undefined) {
				delete process.env.LINK_VISIT_WORKER_CONCURRENCY;
			} else {
				process.env.LINK_VISIT_WORKER_CONCURRENCY = previous;
			}
		}
	});
});

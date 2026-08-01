import { describe, expect, mock, test } from "bun:test";
import {
	addLinkVisitJob,
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
			processLinkVisitJob({ data: event, name: LINK_VISIT_JOB_NAME }, deliver)
		).rejects.toThrow("not acknowledged");
		expect(deliver).toHaveBeenCalledWith(event, event.link_id);
	});

	test("completes only after Kafka acknowledges the immutable payload", async () => {
		const deliver = mock(() => Promise.resolve(true));

		await processLinkVisitJob(
			{ data: event, name: LINK_VISIT_JOB_NAME },
			deliver
		);

		expect(deliver).toHaveBeenCalledWith(event, event.link_id);
	});

	test("rejects unknown job names", async () => {
		await expect(
			processLinkVisitJob({ data: event, name: "unknown" })
		).rejects.toThrow("Unknown link visit job");
	});
});

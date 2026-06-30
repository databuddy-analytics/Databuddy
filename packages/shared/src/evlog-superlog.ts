import type { DrainContext } from "evlog";
import { createOTLPDrain } from "evlog/otlp";
import { createDrainPipeline } from "evlog/pipeline";

export function createBatchedSuperlogDrain() {
	const apiKey = process.env.SUPERLOG_API_KEY;
	if (!apiKey) {
		return null;
	}
	return createDrainPipeline<DrainContext>({
		batch: { size: 50, intervalMs: 5000 },
		maxBufferSize: 2000,
	})(
		createOTLPDrain({
			endpoint: "https://intake.superlog.sh",
			headers: { Authorization: `Bearer ${apiKey}` },
		})
	);
}

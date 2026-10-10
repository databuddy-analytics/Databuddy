import type { ImportRunJobData } from "@databuddy/redis";
import { PermanentImportError, runImportJob } from "@databuddy/services/import";
import { type Job, UnrecoverableError } from "bullmq";
import { captureInsightsError } from "./lib/evlog-insights";

export const IMPORT_FAILED_MESSAGE =
	"Something went wrong on our side while importing this file. Try again in a few minutes, and contact support if it keeps failing.";

export async function processImportJob(job: Job<ImportRunJobData>) {
	try {
		return await runImportJob(job.data, ({ rows }) => job.updateProgress(rows));
	} catch (error) {
		if (error instanceof PermanentImportError) {
			throw new UnrecoverableError(error.message);
		}
		captureInsightsError(error, "import.attempt_failed", {
			run_id: job.data.runId,
			website_id: job.data.websiteId,
			attempt: job.attemptsMade + 1,
		});
		throw new Error(IMPORT_FAILED_MESSAGE);
	}
}

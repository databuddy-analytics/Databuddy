import { Queue } from "bullmq";
import { getBullMQConnectionOptions } from "./bullmq";

export const IMPORT_QUEUE_ENV_PREFIX = "IMPORT";
export const IMPORT_QUEUE_NAME = "analytics-import";
export const IMPORT_RUN_JOB_NAME = "analytics-import-run";

export const IMPORT_JOB_TIMEOUT_MS = 900_000;

export const IMPORT_JOB_OPTIONS = {
	attempts: 3,
	backoff: {
		type: "exponential",
		delay: 15_000,
	},
	stackTraceLimit: 3,
	removeOnComplete: {
		age: 7 * 24 * 3600,
		count: 1000,
	},
	removeOnFail: {
		age: 14 * 24 * 3600,
		count: 5000,
	},
};

export interface ImportRunJobData {
	organizationId: string;
	providerId: string;
	replaceExisting: boolean;
	requestedByUserId: string;
	runId: string;
	storageKey: string;
	timezone: string;
	websiteId: string;
}

let importQueue: Queue<ImportRunJobData> | null = null;

export function getImportQueue(): Queue<ImportRunJobData> {
	importQueue ??= new Queue<ImportRunJobData>(IMPORT_QUEUE_NAME, {
		connection: getBullMQConnectionOptions({
			envPrefix: IMPORT_QUEUE_ENV_PREFIX,
		}),
		defaultJobOptions: IMPORT_JOB_OPTIONS,
	});

	return importQueue;
}

export async function closeImportQueue(): Promise<void> {
	const queue = importQueue;
	importQueue = null;
	await queue?.close();
}

export function importRunJobId(runId: string): string {
	return `import-${runId}`;
}

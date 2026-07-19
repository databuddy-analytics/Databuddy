import { Queue } from "bullmq";
import { getBullMQConnectionOptions } from "./bullmq";

export const INSIGHTS_QUEUE_ENV_PREFIX = "INSIGHTS";
export const INSIGHTS_QUEUE_NAME = "insights-generation";
export const INSIGHTS_DISPATCH_JOB_NAME = "insights-dispatch";
export const INSIGHTS_GENERATE_WEBSITE_JOB_NAME = "insights-generate-website";
export const INSIGHTS_MAINTENANCE_JOB_NAME = "insights-maintenance";
export const INSIGHTS_RESUME_JOB_NAME = "insights-resume";

export const INSIGHTS_JOB_TIMEOUT_MS = 120_000;

export const INSIGHTS_JOB_OPTIONS = {
	attempts: 3,
	backoff: {
		type: "exponential",
		delay: 5000,
	},
	removeOnComplete: {
		age: 24 * 3600,
		count: 1000,
	},
	removeOnFail: {
		age: 7 * 24 * 3600,
		count: 5000,
	},
};

export type InsightGenerationReason =
	| "manual"
	| "scheduled"
	| "cooldown_refresh";

export interface InsightsDispatchJobData {
	reason: "scheduled";
	triggeredAt: string;
}

export interface InsightsMaintenanceJobData {
	reason: "maintenance";
	triggeredAt: string;
}

export interface InsightsResumeJobData {
	replyId: string;
}

export interface InsightsGenerateWebsiteJobData {
	itemId: string;
	organizationId: string;
	reason: InsightGenerationReason;
	requestedByUserId?: string | null;
	runId: string;
	websiteId: string;
}

export type InsightsQueueJobData =
	| InsightsDispatchJobData
	| InsightsGenerateWebsiteJobData
	| InsightsMaintenanceJobData
	| InsightsResumeJobData;

let insightsQueue: Queue<InsightsQueueJobData> | null = null;

export function getInsightsQueue(): Queue<InsightsQueueJobData> {
	insightsQueue ??= new Queue<InsightsQueueJobData>(INSIGHTS_QUEUE_NAME, {
		connection: getBullMQConnectionOptions({
			envPrefix: INSIGHTS_QUEUE_ENV_PREFIX,
		}),
		defaultJobOptions: INSIGHTS_JOB_OPTIONS,
	});

	return insightsQueue;
}

export async function closeInsightsQueue(): Promise<void> {
	if (!insightsQueue) {
		return;
	}
	const queue = insightsQueue;
	insightsQueue = null;
	await queue.close();
}

export function insightsWebsiteJobId(runId: string, websiteId: string): string {
	return `insights-website-${runId}-${websiteId}`;
}

export function insightsResumeJobId(replyId: string): string {
	return `insights-reply-${replyId}`;
}

export async function enqueueInsightsResume(
	replyId: string
): Promise<"queued" | "running" | "succeeded"> {
	const queue = getInsightsQueue();
	const jobId = insightsResumeJobId(replyId);
	const existing = await queue.getJob(jobId);
	if (existing) {
		const state = await existing.getState();
		if (state === "failed") {
			await existing.retry("failed");
			return "queued";
		}
		if (state === "active") {
			return "running";
		}
		if (state === "completed") {
			return "succeeded";
		}
		return "queued";
	}
	await queue.add(INSIGHTS_RESUME_JOB_NAME, { replyId }, { jobId });
	return "queued";
}

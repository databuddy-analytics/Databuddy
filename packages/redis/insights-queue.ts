import { Queue } from "bullmq";
import { getBullMQConnectionOptions } from "./bullmq";

export const INSIGHTS_QUEUE_ENV_PREFIX = "INSIGHTS";
export const INSIGHTS_QUEUE_NAME = "insights-generation";
export const INSIGHTS_DISPATCH_JOB_NAME = "insights-dispatch";
export const INSIGHTS_GENERATE_WEBSITE_JOB_NAME = "insights-generate-website";
export const INSIGHTS_MAINTENANCE_JOB_NAME = "insights-maintenance";
export const INSIGHTS_ROLLUP_JOB_NAME = "insights-rollup";

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

export const INSIGHT_GENERATION_TOOLS = [
	"web_metrics",
	"product_metrics",
	"ops_context",
	"business_context",
] as const;

export type InsightGenerationTool = (typeof INSIGHT_GENERATION_TOOLS)[number];
export type InsightGenerationDepth = "light" | "standard" | "deep";
export type InsightGenerationModelTier = "fast" | "balanced" | "deep";
export type InsightGenerationReason =
	| "manual"
	| "scheduled"
	| "cooldown_refresh";

export interface InsightGenerationConfigSnapshot {
	allowedTools: InsightGenerationTool[];
	cooldownHours: number;
	depth: InsightGenerationDepth;
	lookbackDays: number;
	maxInsightsPerWebsite: number;
	maxSteps: number;
	maxToolCalls: number;
	modelTier: InsightGenerationModelTier;
	timezone: string;
}

export interface InsightsDispatchJobData {
	reason: "scheduled";
	triggeredAt: string;
}

export interface InsightsMaintenanceJobData {
	reason: "maintenance";
	triggeredAt: string;
}

export interface InsightsGenerateWebsiteJobData {
	config: InsightGenerationConfigSnapshot;
	itemId: string;
	organizationId: string;
	reason: InsightGenerationReason;
	requestedByUserId?: string | null;
	runId: string;
	websiteId: string;
}

export interface InsightsRollupJobData {
	organizationId: string;
	reason: InsightGenerationReason;
	runId: string;
	timezone: string;
}

export type InsightsQueueJobData =
	| InsightsDispatchJobData
	| InsightsGenerateWebsiteJobData
	| InsightsMaintenanceJobData
	| InsightsRollupJobData;

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

export function insightsRollupJobId(runId: string): string {
	return `insights-rollup-${runId}`;
}

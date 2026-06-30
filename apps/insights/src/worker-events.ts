import {
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
	INSIGHTS_ROLLUP_JOB_NAME,
} from "@databuddy/redis";

export const UNKNOWN_INSIGHTS_JOB_NAME = "unknown";

export function inferInsightsStalledJobName(jobId: string): string {
	if (jobId.startsWith("insights-website-")) {
		return INSIGHTS_GENERATE_WEBSITE_JOB_NAME;
	}
	if (jobId.startsWith("insights-rollup-")) {
		return INSIGHTS_ROLLUP_JOB_NAME;
	}
	if (jobId.startsWith("repeat:insights-dispatch:")) {
		return INSIGHTS_DISPATCH_JOB_NAME;
	}
	if (jobId.startsWith("repeat:insights-maintenance:")) {
		return INSIGHTS_MAINTENANCE_JOB_NAME;
	}
	return UNKNOWN_INSIGHTS_JOB_NAME;
}

export function buildInsightsStalledJobEvent(jobId: string): {
	job_id: string;
	job_name: string;
} {
	return {
		job_id: jobId,
		job_name: inferInsightsStalledJobName(jobId),
	};
}

import { renderChartPng } from "@databuddy/charts";
import type { RequestLogger } from "evlog";
import type { SlackAgentRun } from "@/agent/agent-client";
import { setSlackLog, toError } from "@/lib/evlog-slack";
import {
	type DashboardComponentPayload,
	renderComponentMarkdown,
} from "@/slack/output-adapter";
import type { SlackAgentClient, SlackLogger } from "@/slack/types";

const MAX_CHART_UPLOADS = 3;
const FILENAME_SAFE_REGEX = /[^a-z0-9]+/g;

type ChartFallbackSay = (message: {
	text: string;
	thread_ts?: string;
}) => Promise<unknown>;

export async function postChartImages({
	charts,
	client,
	eventLog,
	logger,
	run,
	say,
}: {
	charts: DashboardComponentPayload[];
	client: Pick<SlackAgentClient, "files">;
	eventLog?: RequestLogger;
	logger: SlackLogger;
	run: SlackAgentRun;
	say: ChartFallbackSay;
}): Promise<void> {
	if (charts.length === 0) {
		return;
	}

	let uploaded = 0;
	let fallbacks = 0;
	for (const chart of charts.slice(0, MAX_CHART_UPLOADS)) {
		const sent = await uploadChart({ chart, client, logger, run });
		if (sent) {
			uploaded++;
		} else {
			fallbacks++;
			await say({
				text: renderComponentMarkdown(chart),
				thread_ts: run.threadTs,
			}).catch((error) => {
				logger.warn("Failed to post chart fallback", toError(error));
			});
		}
	}

	const skipped = charts.length - Math.min(charts.length, MAX_CHART_UPLOADS);
	setSlackLog(eventLog, {
		slack_chart_fallbacks: fallbacks,
		slack_chart_uploads: uploaded,
		...(skipped > 0 ? { slack_charts_skipped: skipped } : {}),
	});
}

async function uploadChart({
	chart,
	client,
	logger,
	run,
}: {
	chart: DashboardComponentPayload;
	client: Pick<SlackAgentClient, "files">;
	logger: SlackLogger;
	run: SlackAgentRun;
}): Promise<boolean> {
	try {
		const png = renderChartPng(chart);
		if (!png) {
			return false;
		}
		const title = typeof chart.title === "string" ? chart.title : chart.type;
		const upload = {
			channel_id: run.channelId,
			file: png,
			filename: `${toFilename(title)}.png`,
			title,
		};
		const result = run.threadTs
			? await client.files.uploadV2({ ...upload, thread_ts: run.threadTs })
			: await client.files.uploadV2(upload);
		return result.ok === true;
	} catch (error) {
		logger.warn("Failed to upload chart image", toError(error));
		return false;
	}
}

function toFilename(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(FILENAME_SAFE_REGEX, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "chart";
}

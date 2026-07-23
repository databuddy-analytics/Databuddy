import { db, eq, type Feedback, feedback, user } from "@databuddy/db";
import { randomUUIDv7 } from "bun";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";
const SLACK_TIMEOUT_MS = 10_000;
const DESCRIPTION_PREVIEW_LIMIT = 500;

const CATEGORY_LABELS: Record<Feedback["category"], string> = {
	bug_report: "Bug Report",
	feature_request: "Feature Request",
	ux_improvement: "UX Improvement",
	performance: "Performance",
	documentation: "Documentation",
	other: "Other",
};

const SOURCE_LABELS: Record<Feedback["source"], string> = {
	dashboard: "Dashboard",
	agent: "Databunny agent",
	slack: "Slack bot",
	mcp: "MCP",
};

export interface SubmitFeedbackInput {
	category: Feedback["category"];
	conversationId?: string | null;
	description: string;
	metadata?: Record<string, unknown> | null;
	organizationId: string;
	source: Feedback["source"];
	title: string;
	userEmail?: string | null;
	userId: string;
	websiteDomain?: string | null;
	websiteId?: string | null;
}

export async function submitFeedback(
	input: SubmitFeedbackInput
): Promise<Feedback> {
	const [row] = await db
		.insert(feedback)
		.values({
			id: randomUUIDv7(),
			userId: input.userId,
			organizationId: input.organizationId,
			title: input.title,
			description: input.description,
			category: input.category,
			source: input.source,
			websiteId: input.websiteId ?? null,
			conversationId: input.conversationId ?? null,
			metadata: input.metadata ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to record feedback");
	}

	notifyFeedbackSlack(row, input).catch(() => {});

	return row;
}

function escapeMrkdwn(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\|/g, "&#124;");
}

async function lookupUserEmail(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row?.email ?? null;
}

async function notifyFeedbackSlack(
	row: Feedback,
	input: SubmitFeedbackInput
): Promise<void> {
	if (!SLACK_WEBHOOK_URL) {
		return;
	}

	const email = input.userEmail ?? (await lookupUserEmail(input.userId));
	const safeTitle = escapeMrkdwn(row.title);
	const safeDescription = escapeMrkdwn(
		row.description.slice(0, DESCRIPTION_PREVIEW_LIMIT)
	);
	const truncationSuffix =
		row.description.length > DESCRIPTION_PREVIEW_LIMIT ? "..." : "";
	const safeSubmitter = escapeMrkdwn(email ?? row.userId);

	const fields = [
		{ type: "mrkdwn", text: `*Title:*\n${safeTitle}` },
		{ type: "mrkdwn", text: `*Category:*\n${CATEGORY_LABELS[row.category]}` },
		{ type: "mrkdwn", text: `*Source:*\n${SOURCE_LABELS[row.source]}` },
	];
	if (input.websiteDomain) {
		fields.push({
			type: "mrkdwn",
			text: `*Website:*\n${escapeMrkdwn(input.websiteDomain)}`,
		});
	}

	const contextParts = [
		`Submitted by ${safeSubmitter} · ${new Date().toUTCString()}`,
	];
	if (row.conversationId) {
		contextParts.push(`Conversation: ${escapeMrkdwn(row.conversationId)}`);
	}

	const blocks = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "💬 New Feedback Submitted",
				emoji: true,
			},
		},
		{ type: "section", fields },
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Description:*\n${safeDescription}${truncationSuffix}`,
			},
		},
		{
			type: "context",
			elements: [{ type: "mrkdwn", text: contextParts.join(" · ") }],
		},
	];

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

	try {
		await fetch(SLACK_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ blocks }),
			signal: controller.signal,
		});
	} catch (error) {
		if (error instanceof Error && error.name !== "AbortError") {
			console.error("Failed to send Slack notification for feedback:", {
				error: error.message,
			});
		}
	} finally {
		clearTimeout(timeoutId);
	}
}

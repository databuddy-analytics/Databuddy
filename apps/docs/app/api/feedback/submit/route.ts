import { Databuddy } from "@databuddy/sdk/node";
import { FEEDBACK_CATEGORIES } from "@databuddy/shared/agent-discovery";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceFormRateLimit, getClientIp } from "@/lib/rate-limit";
import { escapeMrkdwn, postSlackBlocks } from "@/lib/slack-format";

const databuddyApiKey = process.env.DATABUDDY_API_KEY;
const databuddy = databuddyApiKey
	? new Databuddy({
			apiKey: databuddyApiKey,
			websiteId: process.env.DATABUDDY_WEBSITE_ID,
		})
	: null;

const feedbackSchema = z.object({
	message: z.string().trim().min(10).max(4000),
	page: z.string().trim().url().max(500).optional().catch(undefined),
	category: z.enum(FEEDBACK_CATEGORIES).catch("other").optional(),
	agent: z.string().trim().min(1).max(120).optional().catch(undefined),
	contact: z.string().trim().min(3).max(200).optional().catch(undefined),
});

type FeedbackData = z.infer<typeof feedbackSchema>;

function buildSlackBlocks(data: FeedbackData, ip: string): unknown[] {
	const lines = [
		data.category ? `*Category:* ${escapeMrkdwn(data.category)}` : "",
		data.agent ? `*Agent:* ${escapeMrkdwn(data.agent)}` : "",
		data.page ? `*Page:* ${escapeMrkdwn(data.page)}` : "",
		data.contact ? `*Contact:* ${escapeMrkdwn(data.contact)}` : "",
	].filter(Boolean);

	return [
		{
			type: "header",
			text: { type: "plain_text", text: "Agent Feedback", emoji: true },
		},
		...(lines.length > 0
			? [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }]
			: []),
		{
			type: "section",
			text: { type: "mrkdwn", text: escapeMrkdwn(data.message) },
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: `IP: ${ip}  ·  ${new Date().toUTCString()}`,
				},
			],
		},
	];
}

export async function POST(request: NextRequest) {
	const rateLimited = await enforceFormRateLimit(request, {
		key: "feedback",
		max: 10,
		windowSec: 600,
	});
	if (rateLimited) {
		return rateLimited;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON format in request body" },
			{ status: 400 }
		);
	}

	const parsed = feedbackSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{
				error: "Validation failed",
				details: parsed.error.issues.map(
					(issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
				),
			},
			{ status: 400 }
		);
	}

	try {
		await Promise.all([
			postSlackBlocks(
				buildSlackBlocks(parsed.data, getClientIp(request.headers))
			),
			databuddy
				? databuddy
						.track({
							name: "agent_feedback_submitted",
							properties: {
								category: parsed.data.category ?? "other",
								agent: parsed.data.agent,
								has_contact: Boolean(parsed.data.contact),
							},
						})
						.then(() => databuddy.flush())
				: Promise.resolve(),
		]);

		return NextResponse.json({
			success: true,
			message: "Feedback received. Thank you.",
		});
	} catch (error) {
		console.error("feedback/submit failed", error);
		return NextResponse.json(
			{ error: "Unable to submit feedback" },
			{ status: 502 }
		);
	}
}

export function GET() {
	return NextResponse.json(
		{
			error: "Method not allowed",
			hint: "POST JSON feedback here. See https://www.databuddy.cc/feedback.md",
		},
		{ status: 405 }
	);
}

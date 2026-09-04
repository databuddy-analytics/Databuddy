import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceFormRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import {
	createSlackField,
	escapeMrkdwn,
	mrkdwnLink,
	postSlackBlocks,
} from "@/lib/slack-format";

const MIN_NAME_LENGTH = 2;

const ACCELERATOR_LABELS: Record<string, string> = {
	none: "Not in one",
	yc: "Y Combinator",
	techstars: "Techstars",
	antler: "Antler",
	"500-global": "500 Global",
	"entrepreneur-first": "Entrepreneur First",
	"a16z-speedrun": "a16z Speedrun",
	other: "Other",
};

function isGitHubRepoUrl(value: string): boolean {
	try {
		const url = new URL(value);
		if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
			return false;
		}
		const segments = url.pathname.split("/").filter(Boolean);
		return segments.length >= 2;
	} catch {
		return false;
	}
}

const ossSchema = z.object({
	name: z
		.string("Name is required")
		.trim()
		.min(MIN_NAME_LENGTH, "Name is required"),
	email: z
		.string("Valid email is required")
		.trim()
		.pipe(z.email("Valid email is required")),
	projectName: z
		.string("Project name is required")
		.trim()
		.min(1, "Project name is required"),
	repoUrl: z
		.string("A valid github.com repository URL is required")
		.trim()
		.refine(isGitHubRepoUrl, "A valid github.com repository URL is required"),
	accelerator: z
		.unknown()
		.transform((value) =>
			typeof value === "string" && value in ACCELERATOR_LABELS ? value : "none"
		),
	notes: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined),
});

type OssFormData = z.infer<typeof ossSchema>;

function buildSlackBlocks(data: OssFormData, ip: string): unknown[] {
	const fields = [
		createSlackField("Name", data.name),
		createSlackField("Email", data.email),
		createSlackField("Project", data.projectName),
		{
			type: "mrkdwn" as const,
			text: `*Repo:*\n${mrkdwnLink(data.repoUrl, data.repoUrl)}`,
		},
		createSlackField(
			"Accelerator",
			ACCELERATOR_LABELS[data.accelerator] ?? data.accelerator
		),
		createSlackField("IP", ip),
	];

	const blocks: unknown[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "New OSS Program Application",
				emoji: true,
			},
		},
	];

	for (let i = 0; i < fields.length; i += 2) {
		blocks.push({
			type: "section",
			fields: fields.slice(i, i + 2),
		});
	}

	if (data.notes) {
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Notes:*\n${escapeMrkdwn(data.notes)}`,
			},
		});
	}

	return blocks;
}

export async function POST(request: NextRequest) {
	const verification = await checkBotId();
	if (verification.isBot) {
		return NextResponse.json({ error: "Access denied" }, { status: 403 });
	}

	const rateLimited = await enforceFormRateLimit(request, {
		key: "oss",
		max: 3,
		windowSec: 600,
	});
	if (rateLimited) {
		return rateLimited;
	}

	try {
		let formData: unknown;
		try {
			formData = await request.json();
		} catch {
			return NextResponse.json(
				{ error: "Invalid JSON format in request body" },
				{ status: 400 }
			);
		}

		const validation = ossSchema.safeParse(formData);

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Validation failed",
					details: validation.error.issues.map((issue) => issue.message),
				},
				{ status: 400 }
			);
		}

		await postSlackBlocks(
			buildSlackBlocks(
				validation.data,
				getClientIp(request.headers) ?? "unknown"
			)
		);

		return NextResponse.json({
			success: true,
			message: "OSS application submitted successfully",
		});
	} catch (error) {
		console.error("oss/submit failed", error);
		return NextResponse.json(
			{ error: "Unable to submit OSS application" },
			{ status: 502 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

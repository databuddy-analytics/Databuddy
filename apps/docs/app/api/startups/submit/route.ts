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
const MAX_CHOICE_LENGTH = 40;

function isWebsiteUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

const startupsSchema = z.object({
	name: z
		.string("Name is required")
		.trim()
		.min(MIN_NAME_LENGTH, "Name is required"),
	email: z
		.string("Valid email is required")
		.trim()
		.pipe(z.email("Valid email is required")),
	companyName: z
		.string("Company name is required")
		.trim()
		.min(1, "Company name is required"),
	website: z
		.string("A valid website URL is required")
		.trim()
		.refine(isWebsiteUrl, "A valid website URL is required"),
	funding: z
		.string("Funding is required")
		.trim()
		.min(1, "Funding is required")
		.max(MAX_CHOICE_LENGTH),
	accelerator: z
		.string("Accelerator is required")
		.trim()
		.min(1, "Accelerator is required")
		.max(MAX_CHOICE_LENGTH),
	notes: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined),
});

type StartupsFormData = z.infer<typeof startupsSchema>;

function buildSlackBlocks(data: StartupsFormData, ip: string): unknown[] {
	const fields = [
		createSlackField("Name", data.name),
		createSlackField("Email", data.email),
		createSlackField("Company", data.companyName),
		{
			type: "mrkdwn" as const,
			text: `*Website:*\n${mrkdwnLink(data.website, data.website)}`,
		},
		createSlackField("Raised", data.funding),
		createSlackField("Accelerator", data.accelerator),
		createSlackField("IP", ip),
	];

	const blocks: unknown[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "New Startup Program Application",
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
		key: "startups",
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

		const validation = startupsSchema.safeParse(formData);

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
			message: "Startup application submitted successfully",
		});
	} catch (error) {
		console.error("startups/submit failed", error);
		return NextResponse.json(
			{ error: "Unable to submit startup application" },
			{ status: 502 }
		);
	}
}

import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceFormRateLimit, getClientIp } from "@/lib/rate-limit";
import {
	createSlackField,
	escapeMrkdwn,
	postSlackBlocks,
} from "@/lib/slack-format";

const MIN_NAME_LENGTH = 2;
const MIN_WHY_AMBASSADOR_LENGTH = 10;

function isValidURL(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function isValidXHandle(handle: string): boolean {
	return !(handle.includes("@") || handle.includes("http"));
}

const optionalTrimmed = z
	.string()
	.trim()
	.optional()
	.transform((value) => value || undefined);

const ambassadorSchema = z.object({
	name: z
		.string("Name is required and must be at least 2 characters")
		.trim()
		.min(MIN_NAME_LENGTH, "Name is required and must be at least 2 characters"),
	email: z
		.string("Valid email is required")
		.trim()
		.pipe(z.email("Valid email is required")),
	whyAmbassador: z
		.string(
			"Please explain why you want to be an ambassador (minimum 10 characters)"
		)
		.trim()
		.min(
			MIN_WHY_AMBASSADOR_LENGTH,
			"Please explain why you want to be an ambassador (minimum 10 characters)"
		),
	xHandle: optionalTrimmed.refine(
		(value) => !value || isValidXHandle(value),
		"X handle should not include @ or URLs"
	),
	website: optionalTrimmed.refine(
		(value) => !value || isValidURL(value),
		"Website must be a valid URL"
	),
	experience: optionalTrimmed,
	audience: optionalTrimmed,
	referralSource: optionalTrimmed,
});

type AmbassadorFormData = z.infer<typeof ambassadorSchema>;

function buildSlackBlocks(data: AmbassadorFormData, ip: string): unknown[] {
	const fields = [
		createSlackField("Name", data.name),
		createSlackField("Email", data.email),
		createSlackField("X Handle", data.xHandle || "Not provided"),
		createSlackField("Website", data.website || "Not provided"),
	];

	if (data.experience) {
		fields.push(createSlackField("Experience", data.experience));
	}

	if (data.audience) {
		fields.push(createSlackField("Audience", data.audience));
	}

	if (data.referralSource) {
		fields.push(createSlackField("Referral Source", data.referralSource));
	}

	fields.push(createSlackField("IP", ip));

	const blocks: unknown[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "🎯 New Ambassador Application",
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

	blocks.push({
		type: "section",
		text: {
			type: "mrkdwn",
			text: `*Why Ambassador:*\n${escapeMrkdwn(data.whyAmbassador)}`,
		},
	});

	return blocks;
}

export async function POST(request: NextRequest) {
	const verification = await checkBotId();
	if (verification.isBot) {
		return NextResponse.json({ error: "Access denied" }, { status: 403 });
	}

	const rateLimited = await enforceFormRateLimit(request, {
		key: "ambassador",
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

		const validation = ambassadorSchema.safeParse(formData);

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Validation failed",
					details: validation.error.issues.map((issue) => issue.message),
				},
				{ status: 400 }
			);
		}

		const ambassadorData = validation.data;

		await postSlackBlocks(
			buildSlackBlocks(ambassadorData, getClientIp(request.headers))
		);

		return NextResponse.json({
			success: true,
			message: "Ambassador application submitted successfully",
		});
	} catch (error) {
		console.error("ambassador/submit failed", error);
		return NextResponse.json(
			{ error: "Unable to submit ambassador application" },
			{ status: 502 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

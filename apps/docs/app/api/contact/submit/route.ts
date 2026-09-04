import { Databuddy } from "@databuddy/sdk/node";
import { checkBotId } from "botid/server";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceFormRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import { escapeMrkdwn, mrkdwnLink, postSlackBlocks } from "@/lib/slack-format";

const databuddyApiKey = process.env.DATABUDDY_API_KEY;
const databuddy = databuddyApiKey
	? new Databuddy({
			apiKey: databuddyApiKey,
			websiteId: process.env.DATABUDDY_WEBSITE_ID,
		})
	: null;

const MIN_NAME_LENGTH = 2;
const URL_TLD_REGEX = /\.[a-z]{2,}$/i;

function isValidUrl(value: string): boolean {
	const url =
		value.startsWith("http") || value.startsWith("//")
			? value
			: `https://${value}`;
	try {
		const parsed = new URL(url);
		return parsed.hostname.includes(".") && URL_TLD_REGEX.test(parsed.hostname);
	} catch {
		return false;
	}
}

const contactSchema = z.object({
	fullName: z
		.string("Full name is required and must be at least 2 characters")
		.trim()
		.min(
			MIN_NAME_LENGTH,
			"Full name is required and must be at least 2 characters"
		),
	businessName: z
		.string(
			"Business or website name is required and must be at least 2 characters"
		)
		.trim()
		.min(
			MIN_NAME_LENGTH,
			"Business or website name is required and must be at least 2 characters"
		),
	website: z
		.string("Valid website URL is required")
		.trim()
		.refine(isValidUrl, "Valid website URL is required")
		.transform((value) =>
			value.startsWith("http") || value.startsWith("//")
				? value
				: `https://${value}`
		),
	email: z
		.string("Valid email is required")
		.trim()
		.pipe(z.email("Valid email is required")),
	phone: z
		.string()
		.trim()
		.optional()
		.transform((value) => value || undefined)
		.refine(
			(value) => !value || isValidPhoneNumber(value),
			"Please enter a valid phone number"
		),
	topic: z
		.string()
		.trim()
		.optional()
		.transform((value) => (value ? value.slice(0, 120) : undefined)),
	anonId: z.string().optional().catch(undefined),
	sessionId: z.string().optional().catch(undefined),
});

type ContactFormData = z.infer<typeof contactSchema>;

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function getPhoneCountry(phone: string): string {
	try {
		const parsed = parsePhoneNumber(phone);
		const code = parsed?.country;
		if (code) {
			return ` (${regionNames.of(code) ?? code})`;
		}
	} catch {
		/* skip */
	}
	return "";
}

function buildSlackBlocks(data: ContactFormData, ip: string): unknown[] {
	const lines = [
		data.topic ? `*Topic:* ${escapeMrkdwn(data.topic)}` : "",
		`*Name:* ${escapeMrkdwn(data.fullName)}`,
		`*Business:* ${escapeMrkdwn(data.businessName)}`,
		`*Website:* ${mrkdwnLink(data.website, data.website)}`,
		`*Email:* <mailto:${encodeURIComponent(data.email)}|${escapeMrkdwn(data.email)}>`,
		data.phone
			? `*Phone:* ${escapeMrkdwn(data.phone)}${getPhoneCountry(data.phone)}`
			: "",
	].filter(Boolean);

	return [
		{
			type: "header",
			text: { type: "plain_text", text: "New Contact Lead", emoji: true },
		},
		{
			type: "section",
			text: { type: "mrkdwn", text: lines.join("\n") },
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
	const verification = await checkBotId();
	if (verification.isBot) {
		return NextResponse.json({ error: "Access denied" }, { status: 403 });
	}

	const rateLimited = await enforceFormRateLimit(request, {
		key: "contact",
		max: 5,
		windowSec: 600,
	});
	if (rateLimited) {
		return rateLimited;
	}

	const clientIP = getClientIp(request.headers) ?? "unknown";

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

		const validation = contactSchema.safeParse(formData);

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Validation failed",
					details: validation.error.issues.map((issue) => issue.message),
				},
				{ status: 400 }
			);
		}

		const contactData = validation.data;

		await Promise.all([
			postSlackBlocks(buildSlackBlocks(contactData, clientIP)),
			databuddy
				? databuddy
						.track({
							name: "contact_form_submitted",
							anonymousId: contactData.anonId,
							sessionId: contactData.sessionId,
							properties: {
								fullName: contactData.fullName,
								businessName: contactData.businessName,
								website: contactData.website,
								email: contactData.email,
								phone: contactData.phone,
								ip: clientIP,
							},
						})
						.then(() => databuddy.flush())
				: Promise.resolve(),
		]);

		return NextResponse.json({
			success: true,
			message: "Contact form submitted successfully",
		});
	} catch (error) {
		console.error("contact/submit failed", error);
		return NextResponse.json(
			{ error: "Unable to submit contact form" },
			{ status: 502 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

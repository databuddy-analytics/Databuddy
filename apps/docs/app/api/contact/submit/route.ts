import { Databuddy } from "@databuddy/sdk/node";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import { type NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SLACK_TIMEOUT_MS = 10_000;

const databuddy = new Databuddy({
	apiKey: process.env.DATABUDDY_API_KEY ?? "",
	websiteId: process.env.DATABUDDY_WEBSITE_ID,
});

const MIN_NAME_LENGTH = 2;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_TLD_REGEX = /\.[a-z]{2,}$/i;

interface ContactFormData {
	fullName: string;
	businessName: string;
	website: string;
	email: string;
	phone?: string;
}

type ValidationResult =
	| { valid: true; data: ContactFormData }
	| { valid: false; errors: string[] };

function getClientIP(request: NextRequest): string {
	const cfConnectingIP = request.headers.get("cf-connecting-ip");
	if (cfConnectingIP) {
		return cfConnectingIP.trim();
	}

	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const firstIP = forwarded.split(",")[0]?.trim();
		if (firstIP) {
			return firstIP;
		}
	}

	const realIP = request.headers.get("x-real-ip");
	if (realIP) {
		return realIP.trim();
	}

	return "unknown";
}

function isValidEmail(email: string): boolean {
	return EMAIL_REGEX.test(email);
}

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

function validateFormData(data: unknown): ValidationResult {
	if (!data || typeof data !== "object") {
		return { valid: false, errors: ["Invalid form data"] };
	}

	const formData = data as Record<string, unknown>;
	const errors: string[] = [];

	const fullName = formData.fullName;
	if (
		!fullName ||
		typeof fullName !== "string" ||
		fullName.trim().length < MIN_NAME_LENGTH
	) {
		errors.push("Full name is required and must be at least 2 characters");
	}

	const businessName = formData.businessName;
	if (
		!businessName ||
		typeof businessName !== "string" ||
		businessName.trim().length < MIN_NAME_LENGTH
	) {
		errors.push(
			"Business or website name is required and must be at least 2 characters"
		);
	}

	const website = formData.website;
	if (!website || typeof website !== "string" || !isValidUrl(website.trim())) {
		errors.push("Valid website URL is required");
	}

	const email = formData.email;
	if (!email || typeof email !== "string" || !isValidEmail(email.trim())) {
		errors.push("Valid email is required");
	}

	const phone = formData.phone;
	if (
		phone &&
		typeof phone === "string" &&
		phone.trim().length > 0 &&
		!isValidPhoneNumber(phone.trim())
	) {
		errors.push("Please enter a valid phone number");
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	const normalizedWebsite = String(website).trim();
	const websiteUrl =
		normalizedWebsite.startsWith("http") || normalizedWebsite.startsWith("//")
			? normalizedWebsite
			: `https://${normalizedWebsite}`;

	return {
		valid: true,
		data: {
			fullName: String(fullName).trim(),
			businessName: String(businessName).trim(),
			website: websiteUrl,
			email: String(email).trim(),
			phone:
				phone && typeof phone === "string" && phone.trim().length > 0
					? phone.trim()
					: undefined,
		},
	};
}

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
		`*Name:* ${data.fullName}`,
		`*Business:* ${data.businessName}`,
		`*Website:* <${data.website}|${data.website}>`,
		`*Email:* <mailto:${data.email}|${data.email}>`,
		data.phone ? `*Phone:* ${data.phone}${getPhoneCountry(data.phone)}` : "",
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

async function sendToSlack(data: ContactFormData, ip: string): Promise<void> {
	if (!SLACK_WEBHOOK_URL) {
		return;
	}

	const blocks = buildSlackBlocks(data, ip);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

	try {
		await fetch(SLACK_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ blocks }),
			signal: controller.signal,
		});
	} catch (fetchError) {
		if (fetchError instanceof Error && fetchError.name !== "AbortError") {
			throw fetchError;
		}
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function POST(request: NextRequest) {
	const clientIP = getClientIP(request);

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

		const body = formData as Record<string, unknown>;

		const validation = validateFormData(formData);

		if (!validation.valid) {
			return NextResponse.json(
				{ error: "Validation failed", details: validation.errors },
				{ status: 400 }
			);
		}

		const contactData = validation.data;
		const anonId = typeof body.anonId === "string" ? body.anonId : undefined;
		const sessionId =
			typeof body.sessionId === "string" ? body.sessionId : undefined;

		await Promise.all([
			sendToSlack(contactData, clientIP),
			databuddy
				.track({
					name: "contact_form_submitted",
					anonymousId: anonId,
					sessionId,
					properties: {
						fullName: contactData.fullName,
						businessName: contactData.businessName,
						website: contactData.website,
						email: contactData.email,
						phone: contactData.phone,
						ip: clientIP,
					},
				})
				.then(() => databuddy.flush()),
		]);

		return NextResponse.json({
			success: true,
			message: "Contact form submitted successfully",
		});
	} catch {
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

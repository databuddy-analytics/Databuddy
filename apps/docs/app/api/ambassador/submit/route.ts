// import { createLogger } from "@databuddy/shared/logger";
import { type NextRequest, NextResponse } from "next/server";

// const logger = createLogger("ambassador-form");
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SLACK_TIMEOUT_MS = 10_000;

const MIN_NAME_LENGTH = 2;
const MIN_WHY_AMBASSADOR_LENGTH = 10;

type AmbassadorFormData = {
	name: string;
	email: string;
	xHandle?: string;
	website?: string;
	whyAmbassador: string;
	experience?: string;
	audience?: string;
	referralSource?: string;
};

type ValidationResult =
	| { valid: true; data: AmbassadorFormData }
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

function getUserAgent(request: NextRequest): string {
	return request.headers.get("user-agent") || "unknown";
}

function isValidEmail(email: string): boolean {
	return email.includes("@") && email.length > 3;
}

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

function validateFormData(data: unknown): ValidationResult {
	if (!data || typeof data !== "object") {
		return { valid: false, errors: ["Invalid form data"] };
	}

	const formData = data as Record<string, unknown>;
	const errors: string[] = [];

	const name = formData.name;
	if (
		!name ||
		typeof name !== "string" ||
		name.trim().length < MIN_NAME_LENGTH
	) {
		errors.push("Name is required and must be at least 2 characters");
	}

	const email = formData.email;
	if (!email || typeof email !== "string" || !isValidEmail(email)) {
		errors.push("Valid email is required");
	}

	const whyAmbassador = formData.whyAmbassador;
	if (
		!whyAmbassador ||
		typeof whyAmbassador !== "string" ||
		whyAmbassador.trim().length < MIN_WHY_AMBASSADOR_LENGTH
	) {
		errors.push(
			"Please explain why you want to be an ambassador (minimum 10 characters)"
		);
	}

	const xHandle = formData.xHandle;
	if (
		xHandle &&
		typeof xHandle === "string" &&
		xHandle.length > 0 &&
		!isValidXHandle(xHandle)
	) {
		errors.push("X handle should not include @ or URLs");
	}

	const website = formData.website;
	if (
		website &&
		typeof website === "string" &&
		website.length > 0 &&
		!isValidURL(website)
	) {
		errors.push("Website must be a valid URL");
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		data: {
			name: String(name).trim(),
			email: String(email).trim(),
			xHandle: xHandle ? String(xHandle).trim() : undefined,
			website: website ? String(website).trim() : undefined,
			whyAmbassador: String(whyAmbassador).trim(),
			experience: formData.experience
				? String(formData.experience).trim()
				: undefined,
			audience: formData.audience
				? String(formData.audience).trim()
				: undefined,
			referralSource: formData.referralSource
				? String(formData.referralSource).trim()
				: undefined,
		},
	};
}

function createSlackField(label: string, value: string) {
	return {
		type: "mrkdwn" as const,
		text: `*${label}:*\n${value}`,
	};
}

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
			text: `*Why Ambassador:*\n${data.whyAmbassador}`,
		},
	});

	return blocks;
}

async function sendToSlack(
	data: AmbassadorFormData,
	ip: string
): Promise<void> {
	if (!SLACK_WEBHOOK_URL) {
		console.warn(
			{},
			"SLACK_WEBHOOK_URL not configured, skipping Slack notification"
		);
		return;
	}

	try {
		const blocks = buildSlackBlocks(data, ip);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

		try {
			const response = await fetch(SLACK_WEBHOOK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ blocks }),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const responseText = await response
					.text()
					.catch(() => "Unable to read response");
				console.error(
					{
						status: response.status,
						statusText: response.statusText,
						response: responseText.slice(0, 200),
					},
					"Failed to send Slack webhook"
				);
			}
		} catch (fetchError) {
			clearTimeout(timeoutId);
			if (fetchError instanceof Error && fetchError.name === "AbortError") {
				console.error({}, "Slack webhook request timed out after 10 seconds");
			} else {
				throw fetchError;
			}
		}
	} catch (error) {
		console.error(
			{
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Error sending to Slack webhook"
		);
	}
}

export async function POST(request: NextRequest) {
	const clientIP = getClientIP(request);
	const userAgent = getUserAgent(request);

	try {
		let formData: unknown;
		try {
			formData = await request.json();
		} catch (jsonError) {
			console.warn(
				{
					ip: clientIP,
					userAgent,
					error:
						jsonError instanceof Error ? jsonError.message : String(jsonError),
				},
				"Invalid JSON in request body"
			);
			return NextResponse.json(
				{ error: "Invalid JSON format in request body" },
				{ status: 400 }
			);
		}

		const validation = validateFormData(formData);

		if (!validation.valid) {
			console.info(
				{ errors: validation.errors, ip: clientIP },
				"Form submission failed validation"
			);
			return NextResponse.json(
				{ error: "Validation failed", details: validation.errors },
				{ status: 400 }
			);
		}

		const ambassadorData = validation.data;

		console.info(
			{
				name: ambassadorData.name,
				email: ambassadorData.email,
				ip: clientIP,
				userAgent,
			},
			`${ambassadorData.name} (${ambassadorData.email}) submitted an ambassador application`
		);

		await sendToSlack(ambassadorData, clientIP);

		return NextResponse.json({
			success: true,
			message: "Ambassador application submitted successfully",
		});
	} catch (error) {
		console.error(
			{
				ip: clientIP,
				userAgent,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Error processing ambassador form submission"
		);

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

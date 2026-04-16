import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const SLACK_TIMEOUT_MS = 10_000;

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

interface OssFormData {
	accelerator: string;
	email: string;
	name: string;
	notes?: string;
	projectName: string;
	repoUrl: string;
}

type ValidationResult =
	| { valid: true; data: OssFormData }
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
	return email.includes("@") && email.length > 3;
}

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
		errors.push("Name is required");
	}

	const email = formData.email;
	if (!email || typeof email !== "string" || !isValidEmail(email)) {
		errors.push("Valid email is required");
	}

	const projectName = formData.projectName;
	if (
		!projectName ||
		typeof projectName !== "string" ||
		projectName.trim().length === 0
	) {
		errors.push("Project name is required");
	}

	const repoUrl = formData.repoUrl;
	if (
		!repoUrl ||
		typeof repoUrl !== "string" ||
		!isGitHubRepoUrl(repoUrl.trim())
	) {
		errors.push("A valid github.com repository URL is required");
	}

	const accelerator = formData.accelerator;
	const acceleratorKey =
		typeof accelerator === "string" && accelerator in ACCELERATOR_LABELS
			? accelerator
			: "none";

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		data: {
			name: String(name).trim(),
			email: String(email).trim(),
			projectName: String(projectName).trim(),
			repoUrl: String(repoUrl).trim(),
			accelerator: acceleratorKey,
			notes: formData.notes ? String(formData.notes).trim() : undefined,
		},
	};
}

function createSlackField(label: string, value: string) {
	return {
		type: "mrkdwn" as const,
		text: `*${label}:*\n${value}`,
	};
}

function buildSlackBlocks(data: OssFormData, ip: string): unknown[] {
	const fields = [
		createSlackField("Name", data.name),
		createSlackField("Email", data.email),
		createSlackField("Project", data.projectName),
		createSlackField("Repo", `<${data.repoUrl}|${data.repoUrl}>`),
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
				text: `*Notes:*\n${data.notes}`,
			},
		});
	}

	return blocks;
}

async function sendToSlack(data: OssFormData, ip: string): Promise<void> {
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
	const verification = await checkBotId();
	if (verification.isBot) {
		return NextResponse.json({ error: "Access denied" }, { status: 403 });
	}

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

		const validation = validateFormData(formData);

		if (!validation.valid) {
			return NextResponse.json(
				{ error: "Validation failed", details: validation.errors },
				{ status: 400 }
			);
		}

		await sendToSlack(validation.data, clientIP);

		return NextResponse.json({
			success: true,
			message: "OSS application submitted successfully",
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

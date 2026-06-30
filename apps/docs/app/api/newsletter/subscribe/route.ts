import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
	try {
		const verification = await checkBotId();
		if (verification.isBot) {
			return NextResponse.json({ error: "Access denied" }, { status: 403 });
		}

		let body: Record<string, unknown>;
		try {
			body = (await request.json()) as Record<string, unknown>;
		} catch {
			return NextResponse.json(
				{ error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const email =
			typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

		if (!(email && EMAIL_REGEX.test(email))) {
			return NextResponse.json(
				{ error: "Please enter a valid email address" },
				{ status: 400 }
			);
		}

		const apiKey = process.env.RESEND_API_KEY;
		const audienceId = process.env.RESEND_AUDIENCE_ID;

		if (!(apiKey && audienceId)) {
			console.error("newsletter/subscribe is not configured");
			return NextResponse.json(
				{ error: "Newsletter signup is temporarily unavailable" },
				{ status: 503 }
			);
		}

		const resend = new Resend(apiKey);
		await resend.contacts.create({
			email,
			audienceId,
		});

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Something went wrong";

		if (message.includes("already exists")) {
			return NextResponse.json({ success: true });
		}

		console.error("newsletter/subscribe failed", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

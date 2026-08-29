import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { enforceFormRateLimit } from "@/lib/rate-limit";

const subscribeSchema = z.object({
	email: z
		.string("Please enter a valid email address")
		.trim()
		.toLowerCase()
		.pipe(z.email("Please enter a valid email address")),
});

export async function POST(request: NextRequest) {
	try {
		const verification = await checkBotId();
		if (verification.isBot) {
			return NextResponse.json({ error: "Access denied" }, { status: 403 });
		}

		const rateLimited = await enforceFormRateLimit(request, {
			key: "newsletter",
			max: 5,
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
				{ error: "Invalid request body" },
				{ status: 400 }
			);
		}

		const parsed = subscribeSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "Please enter a valid email address" },
				{ status: 400 }
			);
		}
		const { email } = parsed.data;

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
		const { error } = await resend.contacts.create({
			email,
			audienceId,
		});
		if (error && error.statusCode !== 409) {
			console.error("newsletter/subscribe failed", error);
			return NextResponse.json(
				{ error: "Newsletter signup failed. Please try again later." },
				{ status: 502 }
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("newsletter/subscribe failed", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

export function GET() {
	return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

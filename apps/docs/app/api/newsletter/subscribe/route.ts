import { checkBotId } from "botid/server";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

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
		await resend.contacts.create({
			email,
			audienceId,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
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

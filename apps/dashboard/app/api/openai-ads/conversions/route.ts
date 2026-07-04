import { config } from "@databuddy/env/app";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildOpenAiRegistrationCompletedEvent } from "@/lib/openai-ads-conversions";

const ConversionRequestSchema = z.object({
	email: z.string().email().max(320).optional(),
	eventId: z.string().min(1).max(160),
	oppref: z.string().min(1).max(512).optional(),
	sourceUrl: z.string().url().max(2048),
});

function readClientIp(headers: Headers): string | undefined {
	const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwardedFor || headers.get("x-real-ip")?.trim() || undefined;
}

async function readJson(request: NextRequest): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export async function POST(request: NextRequest) {
	const pixelId = config.integrations.openAiAdsPixelId;
	const apiKey = config.integrations.openAiAdsConversionsApiKey;

	if (!(pixelId && apiKey)) {
		return NextResponse.json({ skipped: true });
	}

	const parsed = ConversionRequestSchema.safeParse(await readJson(request));
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid conversion payload" },
			{ status: 400 }
		);
	}

	const event = buildOpenAiRegistrationCompletedEvent({
		...parsed.data,
		ipAddress: readClientIp(request.headers),
		timestampMs: Date.now(),
		userAgent: request.headers.get("user-agent") ?? undefined,
	});

	const response = await fetch(
		`https://bzr.openai.com/v1/events?pid=${encodeURIComponent(pixelId)}`,
		{
			body: JSON.stringify({ events: [event], validate_only: false }),
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			method: "POST",
		}
	);

	if (!response.ok) {
		return NextResponse.json({ ok: false }, { status: 502 });
	}

	return NextResponse.json({ ok: true });
}

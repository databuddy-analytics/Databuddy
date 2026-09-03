import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
import { NextResponse } from "next/server";

interface FormRateLimitOptions {
	key: string;
	max: number;
	windowSec: number;
}

export async function enforceFormRateLimit(
	request: Request,
	options: FormRateLimitOptions
): Promise<NextResponse | null> {
	const ip = getClientIp(request.headers) ?? "unknown";
	const rl = await ratelimit(
		`docs:${options.key}:${ip}`,
		options.max,
		options.windowSec
	);
	if (rl.success) {
		return null;
	}
	return NextResponse.json(
		{
			success: false,
			error: "Too many submissions. Please try again later.",
		},
		{ status: 429, headers: getRateLimitHeaders(rl) }
	);
}

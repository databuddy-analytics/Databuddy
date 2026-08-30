import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { NextResponse } from "next/server";

export function getClientIp(requestHeaders: Headers): string {
	return (
		requestHeaders.get("cf-connecting-ip")?.trim() ||
		requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		requestHeaders.get("x-real-ip")?.trim() ||
		"unknown"
	);
}

interface FormRateLimitOptions {
	key: string;
	max: number;
	windowSec: number;
}

export async function enforceFormRateLimit(
	request: Request,
	options: FormRateLimitOptions
): Promise<NextResponse | null> {
	const ip = getClientIp(request.headers);
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

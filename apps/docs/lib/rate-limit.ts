import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { NextResponse } from "next/server";

export function getClientIp(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
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
	const ip = getClientIp(request);
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

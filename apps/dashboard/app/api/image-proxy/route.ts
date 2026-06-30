import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { safeFetch, SsrfError } from "@databuddy/shared/ssrf-guard";
import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/avif",
];

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const TIMEOUT_MESSAGE_PATTERN = /timed out/;

function getClientIp(request: NextRequest): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

export async function GET(request: NextRequest) {
	const ip = getClientIp(request);
	const rl = await ratelimit(`image-proxy:${ip}`, 30, 60);
	if (!rl.success) {
		return NextResponse.json(
			{ error: "Too many requests" },
			{ status: 429, headers: getRateLimitHeaders(rl) }
		);
	}

	const url = request.nextUrl.searchParams.get("url");

	if (!url) {
		return NextResponse.json(
			{ error: "Missing url parameter" },
			{ status: 400 }
		);
	}

	try {
		const response = await safeFetch(url, {
			timeoutMs: 10_000,
			maxRedirects: 0,
			headers: {
				"User-Agent": "Databuddy Image Proxy/1.0",
				Accept: "image/*",
			},
		});

		if (!response.ok) {
			return NextResponse.json(
				{ error: "Failed to fetch image" },
				{ status: 502 }
			);
		}

		const contentType =
			response.headers.get("content-type")?.split(";").at(0)?.trim() ?? "";
		if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
			return NextResponse.json(
				{ error: "Invalid content type" },
				{ status: 400 }
			);
		}

		const contentLength = response.headers.get("content-length");
		if (contentLength && Number.parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
			return NextResponse.json({ error: "Image too large" }, { status: 400 });
		}

		const arrayBuffer = await response.arrayBuffer();

		if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
			return NextResponse.json({ error: "Image too large" }, { status: 400 });
		}

		return new NextResponse(arrayBuffer, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400, s-maxage=86400",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy": "default-src 'none'; img-src 'self'",
			},
		});
	} catch (error) {
		if (error instanceof SsrfError) {
			return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
		}
		if (error instanceof Error && TIMEOUT_MESSAGE_PATTERN.test(error.message)) {
			return NextResponse.json({ error: "Request timeout" }, { status: 504 });
		}
		return NextResponse.json(
			{ error: "Failed to fetch image" },
			{ status: 500 }
		);
	}
}

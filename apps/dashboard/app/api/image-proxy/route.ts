import { getRateLimitHeaders, ratelimit } from "@databuddy/redis/rate-limit";
import { safeFetch, SsrfError } from "@databuddy/shared/ssrf-guard";
import { getClientIp } from "@databuddy/shared/utils/client-ip";
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

export async function GET(request: NextRequest) {
	// Without a configured trusted proxy, unverified traffic shares one bucket
	// instead of letting client-controlled forwarding headers bypass the limit.
	const clientIp = getClientIp(request.headers) ?? "unverified";
	const rl = await ratelimit(`image-proxy:${clientIp}`, 30, 60);
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

	const deadline = AbortSignal.timeout(10_000);
	let response: Response | undefined;
	try {
		response = await safeFetch(url, {
			timeoutMs: 10_000,
			signal: deadline,
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

		// Keep one bounded buffer rather than retaining an unbounded body or a
		// potentially huge list of small chunks. Check before copying each chunk.
		const image = new Uint8Array(MAX_IMAGE_SIZE);
		let bytesRead = 0;
		const reader = response.body?.getReader();
		try {
			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					if (bytesRead + value.byteLength > MAX_IMAGE_SIZE) {
						return NextResponse.json(
							{ error: "Image too large" },
							{ status: 400 }
						);
					}
					image.set(value, bytesRead);
					bytesRead += value.byteLength;
				}
			}
		} finally {
			reader?.releaseLock();
		}

		return new NextResponse(image.subarray(0, bytesRead), {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400, s-maxage=86400",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy": "default-src 'none'; img-src 'self'",
			},
		});
	} catch (error) {
		if (deadline.aborted) {
			return NextResponse.json({ error: "Request timeout" }, { status: 504 });
		}
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
	} finally {
		// Release rejected or unread upstream bodies; cancellation may reject if
		// the stream has already failed or was aborted by the request deadline.
		await response?.body?.cancel().catch(() => undefined);
	}
}

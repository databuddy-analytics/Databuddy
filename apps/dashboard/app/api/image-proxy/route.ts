import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/avif",
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url");

	if (!url) {
		return NextResponse.json(
			{ error: "Missing url parameter" },
			{ status: 400 }
		);
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
	}

	// Only allow http/https protocols
	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
	}

	// Block internal/private IPs
	const hostname = parsedUrl.hostname.toLowerCase();
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname.startsWith("192.168.") ||
		hostname.startsWith("10.") ||
		hostname.startsWith("172.") ||
		hostname.endsWith(".local")
	) {
		return NextResponse.json(
			{ error: "Private addresses not allowed" },
			{ status: 400 }
		);
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);

		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Databuddy Image Proxy/1.0",
				Accept: "image/*",
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Failed to fetch image: ${response.status}` },
				{ status: response.status }
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
			},
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return NextResponse.json({ error: "Request timeout" }, { status: 504 });
		}
		return NextResponse.json(
			{ error: "Failed to fetch image" },
			{ status: 500 }
		);
	}
}

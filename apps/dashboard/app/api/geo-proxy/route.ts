import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = [
	"/geojson/countries.geojson",
	"/geojson/subdivisions.json",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function GET(request: NextRequest) {
	const path = request.nextUrl.searchParams.get("path");

	if (!path) {
		return NextResponse.json(
			{ error: "Missing path parameter" },
			{ status: 400 }
		);
	}

	if (!ALLOWED_PATHS.includes(path)) {
		return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
	}

	const url = `https://cdn.databuddy.cc${path}`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30_000);

		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Databuddy Geo Proxy/1.0",
				Accept: "application/json, application/geo+json",
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			return NextResponse.json(
				{ error: `Failed to fetch: ${response.status}` },
				{ status: response.status }
			);
		}

		const contentType =
			response.headers.get("content-type")?.split(";").at(0)?.trim() ?? "";

		const contentLength = response.headers.get("content-length");
		if (contentLength && Number.parseInt(contentLength, 10) > MAX_FILE_SIZE) {
			return NextResponse.json({ error: "File too large" }, { status: 400 });
		}

		const arrayBuffer = await response.arrayBuffer();

		if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
			return NextResponse.json({ error: "File too large" }, { status: 400 });
		}

		return new NextResponse(arrayBuffer, {
			status: 200,
			headers: {
				"Content-Type": contentType || "application/json",
				"Cache-Control": "public, max-age=86400, s-maxage=86400",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return NextResponse.json({ error: "Request timeout" }, { status: 504 });
		}
		return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
	}
}

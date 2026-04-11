import { readFile } from "node:fs/promises";
import path from "node:path";
import {
	getClientAppAllowedOrigins,
	isAllowedTrackerAssetOrigin,
} from "@databuddy/shared/utils/origins";
import { type NextRequest, NextResponse } from "next/server";

const TRACKER_DIST_DIR = path.resolve(
	process.cwd(),
	"../../packages/tracker/dist"
);

function createCorsHeaders(request: NextRequest): Headers {
	const headers = new Headers({
		"Cache-Control": "public, max-age=3600, s-maxage=3600",
		"Content-Type": "application/javascript; charset=utf-8",
		"X-Content-Type-Options": "nosniff",
		"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Cross-Origin-Resource-Policy": "cross-origin",
		Vary: "Origin",
	});
	const origin = request.headers.get("origin");
	const allowedOrigins = getClientAppAllowedOrigins();

	if (origin && isAllowedTrackerAssetOrigin(origin, allowedOrigins)) {
		headers.set("Access-Control-Allow-Origin", origin);
	}

	return headers;
}

export async function serveTrackerScript(
	request: NextRequest,
	filename: string
): Promise<NextResponse> {
	const origin = request.headers.get("origin");
	const allowedOrigins = getClientAppAllowedOrigins();

	if (origin && !isAllowedTrackerAssetOrigin(origin, allowedOrigins)) {
		return new NextResponse("Forbidden", {
			status: 403,
			headers: createCorsHeaders(request),
		});
	}

	try {
		const filePath = path.join(TRACKER_DIST_DIR, filename);
		const contents = await readFile(filePath, "utf8");

		return new NextResponse(contents, {
			status: 200,
			headers: createCorsHeaders(request),
		});
	} catch {
		return new NextResponse("Tracker asset not available", {
			status: 503,
			headers: createCorsHeaders(request),
		});
	}
}

export function handleTrackerScriptOptions(request: NextRequest): NextResponse {
	return new NextResponse(null, {
		status: 204,
		headers: createCorsHeaders(request),
	});
}

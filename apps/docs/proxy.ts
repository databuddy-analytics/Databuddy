import { trackAgentTraffic } from "@databuddy/sdk/agents";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";

const MARKDOWN_NEGOTIATED_PATHS = new Set(["/", "/pricing", "/pricing/"]);

export function proxy(request: NextRequest, event: NextFetchEvent) {
	event.waitUntil(
		trackAgentTraffic(request, {
			apiKey: process.env.DATABUDDY_API_KEY ?? "",
			websiteId: "OXmNQsViBT-FOS_wZCTHc",
		})
	);

	const { pathname } = request.nextUrl;
	if (!MARKDOWN_NEGOTIATED_PATHS.has(pathname)) {
		return NextResponse.next();
	}
	if (acceptMarkdownOverHtml(request.headers.get("accept") ?? "")) {
		const target = pathname === "/" ? "/index.md" : "/api/pricing";
		return NextResponse.rewrite(new URL(target, request.nextUrl));
	}
	const res = NextResponse.next();
	res.headers.set("Vary", "Accept");
	return res;
}

export const config = {
	matcher: [
		"/((?!_next/|favicon|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|ttf|map)$).*)",
	],
};

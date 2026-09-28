import { trackAgents } from "@databuddy/sdk/agents";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";

const MARKDOWN_NEGOTIATED_PATHS = new Set(["/", "/pricing", "/pricing/"]);

const DASHBOARD_HOME_URL = "https://app.databuddy.cc/home";
const SESSION_COOKIE = "__Secure-databuddy.session_token";
const HOMEPAGE_REDIRECT_COOKIE = "databuddy-home-redirect";

function shouldOpenDashboard(request: NextRequest) {
	const site = request.headers.get("sec-fetch-site");
	return (
		request.headers.get("sec-fetch-mode") === "navigate" &&
		(site === "none" || site === "cross-site") &&
		request.cookies.has(SESSION_COOKIE) &&
		request.cookies.get(HOMEPAGE_REDIRECT_COOKIE)?.value !== "off"
	);
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
	event.waitUntil(trackAgents(request, { websiteId: "OXmNQsViBT-FOS_wZCTHc" }));

	const { pathname } = request.nextUrl;
	if (!MARKDOWN_NEGOTIATED_PATHS.has(pathname)) {
		return NextResponse.next();
	}
	if (acceptMarkdownOverHtml(request.headers.get("accept") ?? "")) {
		const target = pathname === "/" ? "/index.md" : "/api/pricing";
		return NextResponse.rewrite(new URL(target, request.nextUrl));
	}
	if (pathname === "/" && shouldOpenDashboard(request)) {
		return NextResponse.redirect(DASHBOARD_HOME_URL);
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

import { trackAgents } from "@databuddy/sdk/agents";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";

const MARKDOWN_NEGOTIATED_PATHS = new Set(["/", "/pricing", "/pricing/"]);

const DASHBOARD_HOME_URL = "https://app.databuddy.cc/home";
const SESSION_COOKIE = "__Secure-databuddy.session_token";
const HOMEPAGE_REDIRECT_COOKIE = "databuddy-home-redirect";
const HOMEPAGE_SEEN_COOKIE = "databuddy-home-seen";
const LOWERCASE_INTEGRATIONS_DOCS = "/docs/integrations";
const INTEGRATIONS_DOCS = "/docs/Integrations";

function isSignedInNavigation(request: NextRequest) {
	return (
		request.headers.get("sec-fetch-mode") === "navigate" &&
		request.cookies.has(SESSION_COOKIE)
	);
}

function shouldOpenDashboard(request: NextRequest) {
	const site = request.headers.get("sec-fetch-site");
	return (
		(site === "none" || site === "cross-site") &&
		!request.cookies.has(HOMEPAGE_SEEN_COOKIE) &&
		request.cookies.get(HOMEPAGE_REDIRECT_COOKIE)?.value !== "off"
	);
}

function isLowercaseIntegrationsDocs(pathname: string) {
	return (
		pathname === LOWERCASE_INTEGRATIONS_DOCS ||
		pathname.startsWith(`${LOWERCASE_INTEGRATIONS_DOCS}/`)
	);
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
	event.waitUntil(trackAgents(request, { websiteId: "OXmNQsViBT-FOS_wZCTHc" }));

	const { pathname } = request.nextUrl;
	if (isLowercaseIntegrationsDocs(pathname)) {
		const target = request.nextUrl.clone();
		target.pathname = `${INTEGRATIONS_DOCS}${pathname.slice(LOWERCASE_INTEGRATIONS_DOCS.length)}`;
		return NextResponse.redirect(target, 308);
	}
	if (!MARKDOWN_NEGOTIATED_PATHS.has(pathname)) {
		return NextResponse.next();
	}
	if (acceptMarkdownOverHtml(request.headers.get("accept") ?? "")) {
		const target = pathname === "/" ? "/index.md" : "/api/pricing";
		return NextResponse.rewrite(new URL(target, request.nextUrl));
	}
	const isSignedInHome = pathname === "/" && isSignedInNavigation(request);
	if (isSignedInHome && shouldOpenDashboard(request)) {
		return NextResponse.redirect(DASHBOARD_HOME_URL, {
			headers: { "Cache-Control": "private, no-store" },
		});
	}
	const res =
		pathname === "/" && request.nextUrl.searchParams.get("mode") === "agent"
			? NextResponse.rewrite(new URL("/agent-view", request.nextUrl))
			: NextResponse.next();
	res.headers.set("Vary", "Accept");
	if (isSignedInHome) {
		res.cookies.set(HOMEPAGE_SEEN_COOKIE, "1", {
			httpOnly: true,
			maxAge: 30 * 60,
			secure: true,
		});
	}
	return res;
}

export const config = {
	matcher: [
		"/((?!_next/|favicon|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|ttf|map)$).*)",
	],
};

import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const SIGN_IN_ROUTES = ["/login", "/register"];
const PUBLIC_AUTH_ROUTES = [...SIGN_IN_ROUTES, "/auth/error"];

const INTELLIGENCE_ALLOWED_PREFIXES = [
	"/insights",
	"/product-intelligence",
	"/customer-intelligence",
	"/agent",
	"/websites",
	"/organizations",
	"/billing",
	"/settings",
	"/onboarding",
	"/login",
	"/register",
	"/api",
	"/dby",
	"/public",
] as const;

const isProduction = process.env.NODE_ENV === "production";

function isIntelligenceProduct(): boolean {
	if (process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT === "intelligence") {
		return true;
	}

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (!appUrl) {
		return false;
	}

	try {
		const { hostname, port } = new URL(
			appUrl.includes("://") ? appUrl : `https://${appUrl}`
		);
		if (/intelligence\.(?:databuddy\.cc|localhost)/.test(hostname)) {
			return true;
		}
		return hostname === "localhost" && port === "3003";
	} catch {
		return false;
	}
}

function isStaticAsset(pathname: string): boolean {
	return (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/brand") ||
		pathname.startsWith("/favicon")
	);
}

function isAllowedWebsitePath(pathname: string): boolean {
	if (pathname === "/websites") {
		return true;
	}

	if (!pathname.startsWith("/websites/")) {
		return false;
	}

	return pathname.includes("/settings") || pathname.includes("/agent");
}

function isAllowedIntelligencePath(pathname: string): boolean {
	if (isStaticAsset(pathname)) {
		return true;
	}

	if (pathname.startsWith("/auth")) {
		return true;
	}

	if (pathname.startsWith("/websites")) {
		return isAllowedWebsitePath(pathname);
	}

	return INTELLIGENCE_ALLOWED_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

function applyIntelligenceRouting(request: NextRequest): NextResponse | null {
	const intelligence = isIntelligenceProduct();
	const { pathname } = request.nextUrl;

	if (
		!intelligence &&
		(pathname.startsWith("/product-intelligence") ||
			pathname.startsWith("/customer-intelligence"))
	) {
		return NextResponse.redirect(new URL("/home", request.url));
	}

	if (!intelligence) {
		return null;
	}

	if (pathname === "/" || pathname === "/home") {
		return NextResponse.redirect(new URL("/insights", request.url));
	}

	if (!isAllowedIntelligencePath(pathname)) {
		return NextResponse.redirect(new URL("/insights", request.url));
	}

	return null;
}

export function proxy(request: NextRequest) {
	const intelligenceRoute = applyIntelligenceRouting(request);
	if (intelligenceRoute) {
		return intelligenceRoute;
	}

	const { pathname, searchParams } = request.nextUrl;
	const sessionCookie = getSessionCookie(request, {
		cookiePrefix: isProduction ? "databuddy" : "databuddy-dev",
	});

	const isSignInRoute = SIGN_IN_ROUTES.some((route) =>
		pathname.startsWith(route)
	);
	const isPublicAuthRoute = PUBLIC_AUTH_ROUTES.some((route) =>
		pathname.startsWith(route)
	);
	const isAddingAccount = searchParams.get("add_account") === "true";
	const postLoginPath = isIntelligenceProduct() ? "/insights" : "/websites";

	if (isSignInRoute && sessionCookie && !isAddingAccount) {
		return NextResponse.redirect(new URL(postLoginPath, request.url));
	}

	if (!(isPublicAuthRoute || sessionCookie)) {
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set(
			"callback",
			`${pathname}${request.nextUrl.search}`
		);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|demo|public|dby|status|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};

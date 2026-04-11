import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const AUTH_ROUTES = ["/login", "/register"];

const isProduction = process.env.NODE_ENV === "production";

export function proxy(request: NextRequest) {
	const { pathname, searchParams } = request.nextUrl;
	const sessionCookie = getSessionCookie(request, {
		cookiePrefix: isProduction ? "databuddy" : "databuddy-dev",
	});

	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
	const isAddingAccount = searchParams.get("add_account") === "true";

	if (isAuthRoute && sessionCookie && !isAddingAccount) {
		return NextResponse.redirect(new URL("/websites", request.url));
	}

	if (!(isAuthRoute || sessionCookie)) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|demo|public|dby|status|databuddy\\.js|databuddy-debug\\.js|vitals\\.js|vitals-debug\\.js|errors\\.js|errors-debug\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};

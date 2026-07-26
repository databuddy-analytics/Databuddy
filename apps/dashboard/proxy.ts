import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const SIGN_IN_ROUTES = ["/login", "/register"];
const PUBLIC_AUTH_ROUTES = [...SIGN_IN_ROUTES, "/auth/error"];

const isProduction = process.env.NODE_ENV === "production";

export function proxy(request: NextRequest) {
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

	if (isSignInRoute && sessionCookie && !isAddingAccount) {
		return NextResponse.redirect(new URL("/websites", request.url));
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

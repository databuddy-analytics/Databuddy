import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const sessionCookie = getSessionCookie(request, {
		cookiePrefix: "databuddy",
	});

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - api (API routes)
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - login (login page)
		 * - demo (demo pages)
		 * - public files (public folder)
		 */
		"/((?!api|_next/static|_next/image|favicon.ico|login|demo|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};

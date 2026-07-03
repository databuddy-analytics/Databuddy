import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
	const accept = request.headers.get("accept") ?? "";
	if (
		request.nextUrl.pathname === "/" &&
		accept.toLowerCase().includes("text/markdown")
	) {
		const url = request.nextUrl.clone();
		url.pathname = "/index.md";
		return NextResponse.rewrite(url);
	}

	return NextResponse.next();
}

export const config = {
	matcher: "/",
};

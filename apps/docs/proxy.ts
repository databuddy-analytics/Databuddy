import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const path = request.nextUrl.pathname;
	if (path !== "/pricing" && path !== "/pricing/") {
		return NextResponse.next();
	}
	if (acceptMarkdownOverHtml(request.headers.get("accept") ?? "")) {
		return NextResponse.rewrite(new URL("/api/pricing", request.nextUrl));
	}
	const res = NextResponse.next();
	res.headers.set("Vary", "Accept");
	return res;
}

export const config = {
	matcher: ["/pricing", "/pricing/"],
};

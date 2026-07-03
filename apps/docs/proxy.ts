import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	if (acceptMarkdownOverHtml(request.headers.get("accept") ?? "")) {
		const target =
			request.nextUrl.pathname === "/" ? "/index.md" : "/api/pricing";
		return NextResponse.rewrite(new URL(target, request.nextUrl));
	}
	const res = NextResponse.next();
	res.headers.set("Vary", "Accept");
	return res;
}

export const config = {
	matcher: ["/", "/pricing", "/pricing/"],
};

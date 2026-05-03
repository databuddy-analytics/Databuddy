import { acceptMarkdownOverHtml } from "@/app/api/pricing/accept-markdown";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const path = request.nextUrl.pathname;
	const wantsMarkdown = acceptMarkdownOverHtml(
		request.headers.get("accept") ?? ""
	);

	if (path === "/pricing" || path === "/pricing/") {
		if (wantsMarkdown) {
			return NextResponse.rewrite(new URL("/api/pricing", request.nextUrl));
		}
		const res = NextResponse.next();
		res.headers.set("Vary", "Accept");
		return res;
	}

	if (path === "/docs" || path.startsWith("/docs/")) {
		if (wantsMarkdown) {
			const slug = path === "/docs" ? "" : path.slice("/docs/".length);
			return NextResponse.rewrite(
				new URL(`/api/docs/raw/${slug}`, request.nextUrl)
			);
		}
		const res = NextResponse.next();
		res.headers.set("Vary", "Accept");
		return res;
	}

	const res = NextResponse.next();
	res.headers.set("Vary", "Accept");
	return res;
}

export const config = {
	matcher: ["/pricing", "/pricing/", "/docs", "/docs/:path*"],
};

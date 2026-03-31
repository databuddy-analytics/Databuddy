import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { acceptMarkdownOverHtml } from "./accept-markdown";
import { buildPricingApiPayload } from "./build-response";

const PRICING_MD = join(process.cwd(), "public", "pricing.md");

export async function GET(request: Request) {
	const accept = request.headers.get("accept") ?? "";
	if (acceptMarkdownOverHtml(accept)) {
		const body = await readFile(PRICING_MD, "utf8");
		return new Response(body, {
			headers: {
				"Content-Type": "text/markdown; charset=utf-8",
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
				"Access-Control-Allow-Origin": "*",
				Vary: "Accept",
			},
		});
	}
	return Response.json(buildPricingApiPayload(request), {
		headers: {
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			"Access-Control-Allow-Origin": "*",
			Vary: "Accept",
		},
	});
}

export function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Max-Age": "86400",
		},
	});
}

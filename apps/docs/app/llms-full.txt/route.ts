import { buildLlmsFullTxt } from "@/lib/agent-docs";

export const revalidate = false;

export async function GET() {
	const body = await buildLlmsFullTxt();

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${Buffer.from(body).length.toString(36)}"`,
		},
	});
}

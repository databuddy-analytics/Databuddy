import { markdownHeaders, readDocMarkdown } from "@/lib/agent-docs";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug?: string[] }> }
) {
	const { slug = [] } = await params;
	const doc = await readDocMarkdown(slug);
	if (!doc) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(doc.body, {
		headers: markdownHeaders(doc.body),
	});
}

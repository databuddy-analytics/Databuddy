import { createHash } from "node:crypto";
import matter from "gray-matter";
import { source } from "@/lib/source";

function isUnsafeSegment(segment: string): boolean {
	return (
		segment.length === 0 ||
		segment.includes("..") ||
		segment.includes("\0") ||
		segment.includes("/") ||
		segment.includes("\\")
	);
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string[] }> }
) {
	const { slug } = await params;
	if (slug.some(isUnsafeSegment)) {
		return new Response("Not found", { status: 404 });
	}
	const requestedPath = slug.join("/");
	const page =
		source.getPage(slug) ??
		source
			.getPages()
			.find((entry) => entry.file.flattenedPath === requestedPath);
	if (!page) {
		return new Response("Not found", { status: 404 });
	}

	const { content: markdown } = matter(await page.data.getText("raw"));
	const header = page.data.title ? `# ${page.data.title}\n\n` : "";
	const description = page.data.description
		? `> ${page.data.description}\n\n`
		: "";
	const body = `${header}${description}${markdown}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
		},
	});
}

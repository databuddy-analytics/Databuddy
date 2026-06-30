import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

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
	const slugPath = slug.join("/");
	const basePath = path.resolve(process.cwd(), "content/docs");
	const candidates = [
		path.join(basePath, `${slugPath}.mdx`),
		path.join(basePath, slugPath, "index.mdx"),
	];
	const prefix = basePath + path.sep;

	for (const filePath of candidates) {
		const resolved = path.resolve(filePath);
		if (!resolved.startsWith(prefix)) {
			continue;
		}
		try {
			const content = await fs.readFile(filePath, "utf-8");
			const { content: markdown, data } = matter(content);

			const header = data.title ? `# ${data.title}\n\n` : "";
			const description = data.description ? `> ${data.description}\n\n` : "";

			const body = header + description + markdown;

			return new Response(body, {
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"Cache-Control": "public, max-age=3600, must-revalidate",
					ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
				},
			});
		} catch {}
	}

	return new Response("Not found", { status: 404 });
}

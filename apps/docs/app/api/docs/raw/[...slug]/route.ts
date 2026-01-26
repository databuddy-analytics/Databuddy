import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string[] }> }
) {
	const { slug } = await params;
	const filePath = path.join(
		process.cwd(),
		"content/docs",
		`${slug.join("/")}.mdx`
	);

	try {
		const content = await fs.readFile(filePath, "utf-8");
		const { content: markdown, data } = matter(content);

		const header = data.title ? `# ${data.title}\n\n` : "";
		const description = data.description ? `> ${data.description}\n\n` : "";

		return new Response(header + description + markdown, {
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}

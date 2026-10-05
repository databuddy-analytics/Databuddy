import { SITE_URL } from "@/app/util/constants";
import {
	createComparisonMarkdown,
	getAllCompetitorSlugs,
	getComparisonData,
} from "@/lib/comparison-config";
import { markdownResponse } from "@/lib/agent-discovery";

export const revalidate = 3600;

export function generateStaticParams() {
	return getAllCompetitorSlugs().map((slug) => ({ slug }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> }
) {
	const { slug } = await params;
	const data = getComparisonData(slug);
	if (!data) {
		return new Response("Not found", { status: 404 });
	}
	return markdownResponse(createComparisonMarkdown(data), {
		headers: { Link: `<${SITE_URL}/compare/${slug}>; rel="canonical"` },
	});
}

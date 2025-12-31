import { structure } from "fumadocs-core/mdx-plugins";
import {
	type AdvancedIndex,
	createSearchAPI,
} from "fumadocs-core/search/server";
import remarkMdx from "remark-mdx";
import type { AsyncPageData } from "@/app/docs/[[...slug]]/page";
import { source } from "@/lib/source";

export const dynamic = "force-dynamic";

// Lazy initialization to avoid build-time errors with async source
let searchApi: ReturnType<typeof createSearchAPI<"advanced">> | null = null;

async function buildIndexes(): Promise<AdvancedIndex[]> {
	const pages = source.getPages();

	const results = await Promise.all(
		pages.map(async (page): Promise<AdvancedIndex | null> => {
			try {
				const pageData = page.data as AsyncPageData;
				if (!pageData.getText) {
					return null;
				}

				const processed = await pageData.getText("processed");

				return {
					id: page.url,
					title: pageData.title ?? "",
					description: pageData.description ?? "",
					url: page.url,
					structuredData: structure(processed, [remarkMdx]),
				};
			} catch {
				console.error(`Failed to index page: ${page.url}`);
				return null;
			}
		}),
	);

	return results.filter((index): index is AdvancedIndex => index !== null);
}

async function getSearchAPI() {
	if (!searchApi) {
		const indexes = await buildIndexes();
		searchApi = createSearchAPI("advanced", { indexes });
	}
	return searchApi;
}

export async function GET(request: Request) {
	const api = await getSearchAPI();
	return api.GET(request);
}

import type { DocData, DocMethods } from "fumadocs-mdx/runtime/types";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsFooter } from "@/components/docs-footer";
import { Feedback } from "@/components/feedback";
import { StructuredData } from "@/components/structured-data";
import { getDocsPageSeo } from "@/lib/docs-page-seo";
import { onRateDocs } from "@/lib/feedback-action";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export type AsyncPageData = DocMethods & {
	title?: string;
	description?: string;
	load: () => Promise<DocData>;
};

export default async function Page(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const pageData = page.data as AsyncPageData;
	const { body: MDX, toc } = await pageData.load();

	const seo = getDocsPageSeo(page);
	const docDateIso = new Date().toISOString();

	return (
		<>
			<StructuredData
				elements={[
					{
						type: "documentation",
						value: {
							title: seo.title,
							description: seo.description,
							datePublished: docDateIso,
							dateModified: docDateIso,
							section: seo.sectionLabel,
							keywords: seo.keywords,
						},
					},
				]}
				page={{
					title: seo.title,
					description: seo.description,
					url: seo.url,
					imageUrl: seo.ogImage,
				}}
			/>
			<DocsPage
				editOnGithub={{
					owner: "databuddy-analytics",
					repo: "databuddy",
					sha: "main",
					path: `/apps/docs/content/docs/${page.file.path}`,
				}}
				footer={{
					component: <DocsFooter />,
					enabled: true,
				}}
				tableOfContent={{
					style: "clerk",
				}}
				toc={toc}
			>
				<DocsTitle>{page.data.title}</DocsTitle>
				<DocsBody>
					<MDX components={getMDXComponents()} />
				</DocsBody>
				<Feedback onRateAction={onRateDocs} />
			</DocsPage>
		</>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: {
	params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const {
		title,
		description,
		url,
		ogImage,
		keywords,
		pageTitle,
		sectionLabel,
	} = getDocsPageSeo(page);

	return {
		title,
		description,
		keywords,
		category: "Documentation",
		openGraph: {
			title,
			description,
			url,
			type: "article",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: `${pageTitle} — Databuddy Docs`,
				},
			],
		},
		alternates: {
			canonical: url,
		},
		other: {
			"article:section": sectionLabel,
			"article:tag": pageTitle,
		},
	};
}

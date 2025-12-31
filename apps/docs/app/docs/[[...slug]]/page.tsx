import type { DocData, DocMethods } from "fumadocs-mdx/runtime/types";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsFooter } from "@/components/docs-footer";
import { Feedback } from "@/components/feedback";
import { onRateDocs } from "@/lib/feedback-action";
import { getPageImage, source } from "@/lib/source";
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

	return (
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

	const pageTitle = page.data.title ?? "Documentation";
	const url = `https://www.databuddy.cc${page.url}`;
	const title = `${pageTitle} | Databuddy Documentation`;
	const description =
		page.data.description ??
		`Learn about ${pageTitle} in Databuddy's privacy-first analytics platform. Complete guides and API documentation.`;
	const ogImage = `https://www.databuddy.cc${getPageImage(page).url}`;

	const baseKeywords = [
		pageTitle.toLowerCase(),
		"databuddy",
		"analytics",
		"privacy-first",
		"documentation",
		"web analytics",
		"GDPR compliant",
		"cookieless analytics",
		"data ownership",
	];

	const contextKeywords = [
		...(page.url.includes("integration") || page.url.includes("Integrations")
			? ["integration", "setup guide", "installation"]
			: []),
		...(page.url.includes("api")
			? ["API", "reference", "endpoints", "REST API"]
			: []),
		...(page.url.includes("getting-started")
			? ["tutorial", "quickstart", "setup"]
			: []),
		...(page.url.includes("sdk") ? ["SDK", "JavaScript", "tracking"] : []),
		...(page.url.includes("dashboard") ? ["dashboard", "interface", "UI"] : []),
		...(page.url.includes("security")
			? ["security", "privacy", "compliance"]
			: []),
		...(page.url.includes("performance")
			? ["performance", "core web vitals", "optimization"]
			: []),
		...(page.url.includes("react") ? ["React", "React.js", "component"] : []),
		...(page.url.includes("nextjs")
			? ["Next.js", "React framework", "SSR"]
			: []),
		...(page.url.includes("wordpress") ? ["WordPress", "plugin", "CMS"] : []),
		...(page.url.includes("shopify")
			? ["Shopify", "e-commerce", "online store"]
			: []),
	];

	return {
		title,
		description,
		keywords: [...baseKeywords, ...contextKeywords],
		authors: [{ name: "Databuddy Team" }],
		creator: "Databuddy",
		publisher: "Databuddy",
		category: "Documentation",
		openGraph: {
			title,
			description,
			url,
			siteName: "Databuddy Documentation",
			type: "article",
			locale: "en_US",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: `${pageTitle} - Databuddy Documentation`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogImage],
			creator: "@databuddyps",
			site: "@databuddyps",
		},
		alternates: {
			canonical: url,
		},
		robots: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
			googleBot: {
				index: true,
				follow: true,
				"max-video-preview": -1,
				"max-image-preview": "large",
				"max-snippet": -1,
			},
		},
		other: {
			"article:section": "Documentation",
			"article:tag": pageTitle,
			"article:author": "Databuddy Team",
			"og:site_name": "Databuddy Documentation",
		},
	};
}

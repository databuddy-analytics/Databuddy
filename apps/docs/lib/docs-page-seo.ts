import { SITE_URL } from "@/app/util/constants";
import type { Breadcrumb } from "@/components/structured-data";
import { type DocPage, getPageImage, source } from "@/lib/source";

export interface DocsPageSeoModel {
	breadcrumbs: Breadcrumb[];
	description: string;
	ogImage: string;
	pageTitle: string;
	sectionLabel: string;
	title: string;
	url: string;
}

const SECTION_MAP: [test: string, label: string][] = [
	["Integrations", "Integrations"],
	["hooks", "React hooks"],
	["sdk", "SDK"],
	["/api", "API reference"],
	["infrastructure-as-code", "Infrastructure as code"],
	["performance", "Performance"],
	["compliance", "Compliance"],
	["privacy", "Privacy"],
	["security", "Security"],
	["dashboard", "Dashboard"],
];

function sectionLabelForUrl(url: string): string {
	for (const [test, label] of SECTION_MAP) {
		if (url.includes(test)) {
			return label;
		}
	}
	return "Documentation";
}

function docsBreadcrumbs(page: DocPage, pageTitle: string): Breadcrumb[] {
	const breadcrumbs: Breadcrumb[] = [
		{ name: "Home", url: SITE_URL },
		{ name: "Docs", url: `${SITE_URL}/docs` },
	];
	const [section, ...rest] = page.slugs;
	if (!section) {
		return breadcrumbs;
	}
	const sectionPage = rest.length > 0 ? source.getPage([section]) : undefined;
	if (sectionPage?.data.title) {
		breadcrumbs.push({
			name: sectionPage.data.title,
			url: `${SITE_URL}${sectionPage.url}`,
		});
	}
	breadcrumbs.push({ name: pageTitle, url: `${SITE_URL}${page.url}` });
	return breadcrumbs;
}

export function getDocsPageSeo(page: DocPage): DocsPageSeoModel {
	const pageTitle = page.data.title ?? "Documentation";
	const url = `${SITE_URL}${page.url}`;
	const title = page.data.seoTitle ?? `${pageTitle} - Docs`;
	const description =
		page.data.description ??
		`${pageTitle} - guides and reference for Databuddy, open-source product analytics for startups.`;
	const ogImage = `${SITE_URL}${getPageImage(page).url}`;
	const sectionLabel = sectionLabelForUrl(page.url);

	return {
		pageTitle,
		title,
		description,
		url,
		ogImage,
		sectionLabel,
		breadcrumbs: docsBreadcrumbs(page, pageTitle),
	};
}

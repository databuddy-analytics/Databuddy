import { type DocPage, getPageImage } from "@/lib/source";

export interface DocsPageSeoModel {
	description: string;
	ogImage: string;
	pageTitle: string;
	sectionLabel: string;
	title: string;
	url: string;
}

const SECTION_MAP: [test: string, label: string][] = [
	["Integrations", "Integrations"],
	["hooks", "React Hooks"],
	["sdk", "SDK"],
	["/api", "API Reference"],
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

export function getDocsPageSeo(page: DocPage): DocsPageSeoModel {
	const pageTitle = page.data.title ?? "Documentation";
	const url = `https://www.databuddy.cc${page.url}`;
	const title = `${pageTitle} - Docs`;
	const description =
		page.data.description ??
		`${pageTitle} - guides and reference for Databuddy, the privacy-first analytics platform.`;
	const ogImage = `https://www.databuddy.cc${getPageImage(page).url}`;
	const sectionLabel = sectionLabelForUrl(page.url);

	return {
		pageTitle,
		title,
		description,
		url,
		ogImage,
		sectionLabel,
	};
}

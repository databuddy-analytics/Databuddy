import { type DocPage, getPageImage } from "@/lib/source";

export interface DocsPageSeoModel {
	pageTitle: string;
	title: string;
	description: string;
	url: string;
	ogImage: string;
	keywords: string[];
	sectionLabel: string;
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
	["revenue", "Revenue"],
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

function contextKeywordsForUrl(url: string): string[] {
	return [
		...(url.includes("integration") || url.includes("Integrations")
			? ["integration", "setup guide", "installation"]
			: []),
		...(url.includes("api")
			? ["API", "reference", "endpoints", "REST API"]
			: []),
		...(url.includes("getting-started")
			? ["tutorial", "quickstart", "setup"]
			: []),
		...(url.includes("sdk") ? ["SDK", "JavaScript", "tracking"] : []),
		...(url.includes("dashboard") ? ["dashboard", "real-time", "UI"] : []),
		...(url.includes("security") ? ["security", "privacy", "compliance"] : []),
		...(url.includes("performance")
			? ["performance", "core web vitals", "optimization"]
			: []),
		...(url.includes("react") ? ["React", "React.js", "component"] : []),
		...(url.includes("nextjs") ? ["Next.js", "server components", "SSR"] : []),
		...(url.includes("wordpress") ? ["WordPress", "plugin", "CMS"] : []),
		...(url.includes("shopify")
			? ["Shopify", "e-commerce", "online store"]
			: []),
	];
}

export function getDocsPageSeo(page: DocPage): DocsPageSeoModel {
	const pageTitle = page.data.title ?? "Documentation";
	const url = `https://www.databuddy.cc${page.url}`;
	const title = `${pageTitle} — Docs`;
	const description =
		page.data.description ??
		`${pageTitle} — guides and reference for Databuddy, the privacy-first analytics platform.`;
	const ogImage = `https://www.databuddy.cc${getPageImage(page).url}`;
	const sectionLabel = sectionLabelForUrl(page.url);

	const keywords = [
		pageTitle.toLowerCase(),
		"databuddy",
		"analytics",
		"privacy-first",
		"web analytics",
		"GDPR compliant",
		"cookieless analytics",
		...contextKeywordsForUrl(page.url),
	];

	return {
		pageTitle,
		title,
		description,
		url,
		ogImage,
		keywords,
		sectionLabel,
	};
}

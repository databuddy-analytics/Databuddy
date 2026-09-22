import { serializeJsonLd } from "@databuddy/shared/json-ld";
import type { RawPlan } from "@/app/(home)/pricing/data";

type JsonLdValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| JsonLdValue[]
	| { [property: string]: JsonLdValue };

interface JsonLdNode {
	"@type": string | string[];
	[property: string]: JsonLdValue;
}

interface Breadcrumb {
	name: string;
	url: string;
}
interface FAQItem {
	answer: string;
	question: string;
}

interface PageProps {
	breadcrumbs?: Breadcrumb[];
	dateModified?: string;
	datePublished?: string;
	description?: string;
	imageUrl?: string;
	inLanguage?: string;
	title?: string;
	url?: string;
}

interface ArticleProps {
	authors?: { name: string; url?: string }[];
	dateModified?: string;
	datePublished?: string;
	description?: string;
	imageUrl?: string;
	title: string;
}

interface DocumentationProps extends ArticleProps {
	keywords?: string[];
	section?: string;
}

interface SoftwareApplicationProps {
	description?: string;
	featureList?: string[];
	name?: string;
	softwareVersion?: string;
}

type ElementItem =
	| { type: "article"; value: ArticleProps }
	| { type: "documentation"; value: DocumentationProps }
	| { type: "faq"; items: FAQItem[] }
	| { type: "softwareApplication"; value?: SoftwareApplicationProps }
	| { type: "softwareOffers"; name?: string; plans: RawPlan[] };

interface StructuredDataProps {
	baseUrl?: string;
	elements?: ElementItem[];
	logoUrl?: string;

	page: PageProps;
}

const EMPTY_ELEMENTS: ElementItem[] = [];

function planToOffer(plan: RawPlan, baseUrl: string) {
	const BLOCK_UNITS_FOR_EVENTS = 1000;
	const toUnitCode = (interval: "day" | "month" | null | undefined) =>
		interval === "month" ? "MON" : interval === "day" ? "DAY" : undefined;

	const priceItem = plan.items.find((i) => i.type === "price");
	const basePrice = priceItem?.price ?? 0;

	const included = plan.items
		.filter((i) => i.type === "feature" || i.type === "priced_feature")
		.map((i) => ({
			"@type": "PropertyValue",
			name: i.feature?.name,
			value:
				i.included_usage === "inf" ? "Unlimited" : String(i.included_usage),
			unitText: i.interval ? `per ${i.interval}` : undefined,
		}));
	if (plan.agentCredits) {
		included.unshift({
			"@type": "PropertyValue",
			name: "AI credits",
			value: String(plan.agentCredits.month),
			unitText: "per month",
		});
	}

	const priceSpecs: JsonLdNode[] = [];

	if (priceItem) {
		priceSpecs.push({
			"@type": "UnitPriceSpecification",
			price: basePrice.toFixed(2),
			priceCurrency: "USD",
			unitCode: "MON",
			unitText: "per month",
		});
	}

	const items = plan.items.filter((i) => i.type === "priced_feature");

	for (const pf of items) {
		if (pf.feature?.id === "events" && pf.tiers?.length) {
			let prevMax: number | undefined =
				typeof pf.included_usage === "number" ? pf.included_usage : undefined;

			for (const t of pf.tiers) {
				const minValue = prevMax == null ? undefined : prevMax + 1;
				const maxValue = t.to === "inf" ? undefined : t.to;

				priceSpecs.push({
					"@type": "UnitPriceSpecification",
					price: (t.amount * BLOCK_UNITS_FOR_EVENTS).toFixed(3),
					priceCurrency: "USD",
					referenceQuantity: {
						"@type": "QuantitativeValue",
						value: BLOCK_UNITS_FOR_EVENTS,
						unitText: "events",
					},
					eligibleQuantity: {
						"@type": "QuantitativeValue",
						minValue,
						maxValue,
						unitText: "total monthly events",
					},
					unitText: "per 1,000 events (overage)",
				});

				if (t.to !== "inf") {
					prevMax = t.to;
				}
			}
		} else if (
			pf.feature_id === "investigation_runs" &&
			typeof pf.price === "number"
		) {
			priceSpecs.push({
				"@type": "UnitPriceSpecification",
				price: pf.price.toFixed(2),
				priceCurrency: "USD",
				unitText: "per additional completed investigation (billed monthly)",
				referenceQuantity: {
					"@type": "QuantitativeValue",
					value: 1,
					unitText: "investigation",
				},
				eligibleQuantity: {
					"@type": "QuantitativeValue",
					minValue:
						typeof pf.included_usage === "number"
							? pf.included_usage + 1
							: undefined,
					unitText: "total monthly completed investigations",
				},
			});
		} else if (typeof pf.price === "number") {
			const refUnit = toUnitCode(pf.interval);
			priceSpecs.push({
				"@type": "UnitPriceSpecification",
				price: pf.price.toFixed(2),
				priceCurrency: "USD",
				unitText: `per ${pf.feature?.display?.singular ?? "unit"}`,
				...(refUnit
					? {
							referenceQuantity: {
								"@type": "QuantitativeValue",
								value: 1,
								unitCode: refUnit,
							},
						}
					: {}),
			});
		}
	}

	return {
		"@type": "Offer",
		name: plan.name,
		url: `${baseUrl}/pricing#${plan.id}`,
		price: basePrice,
		priceCurrency: "USD",
		priceSpecification: priceSpecs,
		itemOffered: {
			"@type": "SoftwareApplication",
			name: "Databuddy",
			operatingSystem: "Web",
			applicationCategory: "BusinessApplication",
			url: baseUrl,
		},
		additionalProperty: included.length ? included : undefined,
	};
}

export function StructuredData({
	baseUrl = "https://www.databuddy.cc",
	logoUrl = "https://www.databuddy.cc/brand/logomark/black.svg",
	page,
	elements = EMPTY_ELEMENTS,
}: StructuredDataProps) {
	const abs = (u?: string) =>
		u ? (u.startsWith("http") ? u : `${baseUrl}${u}`) : undefined;
	const pageUrl = abs(page.url) ?? baseUrl;
	const lang = page.inLanguage || "en";

	const orgId = `${baseUrl}#organization`;
	const websiteId = `${baseUrl}#website`;
	const webPageId = `${pageUrl}#webpage`;
	const breadcrumbId = `${pageUrl}#breadcrumb`;
	const faqId = `${pageUrl}#faq`;
	const softwareId = `${baseUrl}#software`;
	const serviceId = `${baseUrl}#analytics-service`;

	const graph: JsonLdNode[] = [];

	graph.push({
		"@type": "Organization",
		"@id": orgId,
		name: "Databuddy",
		legalName: "Databuddy Analytics, Inc.",
		url: baseUrl,
		logo: { "@type": "ImageObject", url: logoUrl },
		sameAs: [
			"https://github.com/databuddy-analytics",
			"https://x.com/trydatabuddy",
			"https://www.linkedin.com/company/databuddy-analytics",
			"https://www.npmjs.com/package/@databuddy/sdk",
			"https://pypi.org/project/databuddy/",
		],
		email: "support@databuddy.cc",
		contactPoint: {
			"@type": "ContactPoint",
			contactType: "Customer Support",
			email: "support@databuddy.cc",
			url: `${baseUrl}/contact`,
		},
		address: {
			"@type": "PostalAddress",
			addressCountry: "US",
		},
		areaServed: "Worldwide",
	});

	graph.push({
		"@type": "WebSite",
		"@id": websiteId,
		url: baseUrl,
		name: "Databuddy",
		publisher: { "@id": orgId },
	});

	graph.push({
		"@type": "WebPage",
		"@id": webPageId,
		url: pageUrl,
		name: page.title,
		description: page.description,
		isPartOf: { "@id": websiteId },
		about: { "@id": orgId },
		breadcrumb: page.breadcrumbs?.length ? { "@id": breadcrumbId } : undefined,
		datePublished: page.datePublished,
		dateModified: page.dateModified || page.datePublished,
		image: page.imageUrl
			? { "@type": "ImageObject", url: abs(page.imageUrl) }
			: undefined,
		inLanguage: lang,
	});

	graph.push({
		"@type": "Service",
		"@id": serviceId,
		name: "Databuddy privacy-first analytics",
		description:
			"Privacy-first analytics, error tracking, Core Web Vitals monitoring, feature flags, short links, uptime, and automatic investigations for developer teams.",
		provider: { "@type": "Organization", "@id": orgId },
		serviceType: "Web analytics software",
		areaServed: "Worldwide",
		url: baseUrl,
	});

	if (page.breadcrumbs?.length) {
		graph.push({
			"@type": "BreadcrumbList",
			"@id": breadcrumbId,
			itemListElement: page.breadcrumbs.map((crumb, i) => ({
				"@type": "ListItem",
				position: i + 1,
				name: crumb.name,
				item: abs(crumb.url),
			})),
		});
	}

	// Collect FAQ items across all elements, then emit once
	const faqItems: FAQItem[] = [];

	for (const el of elements) {
		if (el.type === "article") {
			const a = el.value;
			graph.push({
				"@type": ["BlogPosting", "Article"],
				headline: a.title,
				description: a.description,
				url: pageUrl,
				mainEntityOfPage: { "@id": webPageId },
				isPartOf: { "@id": websiteId },
				author: a.authors?.length
					? a.authors.map((author) => ({ "@type": "Person", ...author }))
					: { "@type": "Organization", "@id": orgId, name: "Databuddy" },
				publisher: { "@type": "Organization", "@id": orgId },
				image: a.imageUrl
					? { "@type": "ImageObject", url: abs(a.imageUrl) }
					: undefined,
				datePublished: a.datePublished,
				dateModified: a.dateModified || a.datePublished,
				inLanguage: lang,
			});
		} else if (el.type === "documentation") {
			const d = el.value;
			graph.push({
				"@type": ["TechArticle", "Article"],
				headline: d.title,
				description: d.description,
				url: pageUrl,
				mainEntityOfPage: { "@id": webPageId },
				isPartOf: { "@id": websiteId },
				author: {
					"@type": "Organization",
					"@id": orgId,
					name: "Databuddy",
					url: baseUrl,
				},
				publisher: { "@type": "Organization", "@id": orgId },
				image: d.imageUrl
					? { "@type": "ImageObject", url: abs(d.imageUrl) }
					: undefined,
				datePublished: d.datePublished,
				dateModified: d.dateModified || d.datePublished,
				articleSection: d.section ?? "Documentation",
				keywords: d.keywords ?? [
					"analytics",
					"privacy-first",
					"web analytics",
					"GDPR",
					"documentation",
				],
				inLanguage: lang,
			});
		} else if (el.type === "faq") {
			faqItems.push(...el.items);
		} else if (el.type === "softwareApplication") {
			const app = el.value ?? {};
			graph.push({
				"@type": ["SoftwareApplication", "Product"],
				"@id": softwareId,
				name: app.name ?? "Databuddy",
				description:
					app.description ??
					"Privacy-first analytics, error tracking, web vitals, feature flags, short links, and automatic investigations for developer teams.",
				applicationCategory: "BusinessApplication",
				operatingSystem: "Web",
				url: baseUrl,
				softwareVersion: app.softwareVersion,
				featureList: app.featureList,
				brand: { "@id": orgId },
				publisher: { "@type": "Organization", "@id": orgId },
				provider: { "@type": "Organization", "@id": orgId },
				isAccessibleForFree: true,
				sameAs: [
					`${baseUrl}/developers`,
					`${baseUrl}/openapi.json`,
					`${baseUrl}/.well-known/agent.json`,
					`${baseUrl}/.well-known/mcp/server-card.json`,
				],
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
					url: `${baseUrl}/pricing`,
					availability: "https://schema.org/InStock",
				},
			});
		} else if (el.type === "softwareOffers") {
			const offers = el.plans.map((p) => planToOffer(p, baseUrl));

			graph.push({
				"@type": "SoftwareApplication",
				"@id": softwareId,
				name: el.name ?? "Databuddy",
				applicationCategory: "BusinessApplication",
				operatingSystem: "Web",
				url: baseUrl,
				publisher: { "@type": "Organization", "@id": orgId },

				offers: {
					"@type": "AggregateOffer",
					offerCount: offers.length,
					lowPrice: Math.min(
						...offers.map((o) => Number(o.price ?? 0))
					).toFixed(2),
					highPrice: Math.max(
						...offers.map((o) => Number(o.price ?? 0))
					).toFixed(2),
					priceCurrency: "USD",
					offers,
				},
			});
		}
	}

	if (faqItems.length) {
		graph.push({
			"@type": "FAQPage",
			"@id": faqId,
			mainEntity: faqItems.map((f) => ({
				"@type": "Question",
				name: f.question,
				acceptedAnswer: { "@type": "Answer", text: f.answer },
			})),
		});
	}

	const jsonLd = {
		"@context": "https://schema.org",
		"@graph": graph,
	};

	return (
		<script
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
			id="structured-data-page"
			type="application/ld+json"
		/>
	);
}

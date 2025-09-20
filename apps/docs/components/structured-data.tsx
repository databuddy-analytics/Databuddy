import Script from 'next/script';
import type { RawItem, RawPlan } from '@/app/(home)/pricing/data';

interface Breadcrumb {
	name: string;
	url: string;
}
interface FAQItem {
	question: string;
	answer: string;
}

interface PageProps {
	title?: string;
	description?: string;
	url?: string;
	imageUrl?: string;
	breadcrumbs?: Breadcrumb[];
	datePublished?: string;
	dateModified?: string;
	inLanguage?: string;
}

interface ArticleProps {
	title: string;
	description?: string;
	imageUrl?: string;
	datePublished: string;
	dateModified?: string;
}

interface DocumentationProps extends ArticleProps {
	section?: string;
	keywords?: string[];
}

type ElementItem =
	| { type: 'article'; value: ArticleProps }
	| { type: 'documentation'; value: DocumentationProps }
	| { type: 'faq'; items: FAQItem[] }
	| { type: 'softwareOffers'; name?: string; plans: RawPlan[] };

interface StructuredDataProps {
	baseUrl?: string; // default: https://www.databuddy.cc
	logoUrl?: string; // default: {baseUrl}/logo.png

	page: PageProps;

	/** Mixed, repeatable elements */
	elements?: ElementItem[];
}

function planToOffer(plan: RawPlan, baseUrl: string) {
	const BLOCK_UNITS_FOR_EVENTS = 1000; // price is expressed per 1,000 events
	const toUnitCode = (interval: 'day' | 'month' | null | undefined) =>
		interval === 'month' ? 'MON' : interval === 'day' ? 'DAY' : undefined;
	const priceStr = (n: number, decimals = 2) => n.toFixed(decimals); // avoid scientific notation

	const priceItem = plan.items.find((i) => i.type === 'price');
	const basePrice =
		priceItem && typeof priceItem.price === 'number' ? priceItem.price : 0;

	// Included features → additionalProperty
	const included = plan.items
		.filter(
			(i): i is Extract<RawItem, { type: 'feature' }> => i.type === 'feature'
		)
		.map((i) => ({
			'@type': 'PropertyValue',
			name: i.feature?.name,
			value:
				i.included_usage === 'inf' ? 'Unlimited' : String(i.included_usage),
			unitText: i.interval ? `per ${i.interval}` : undefined,
		}));

	// Overage & add-ons → priceSpecification[]
	const priceSpecs: any[] = [];

	// Base monthly plan price
	if (priceItem) {
		priceSpecs.push({
			'@type': 'UnitPriceSpecification',
			price: priceStr(basePrice, 2),
			priceCurrency: 'USD',
			unitCode: 'MON',
			unitText: 'per month',
		});
	}

	const items = plan.items.filter(
		(i): i is Extract<RawItem, { type: 'priced_feature' }> =>
			i.type === 'priced_feature'
	);

	// priced_feature with tiers (events, extra websites, etc.)
	for (const pf of items) {
		// Event overage tiers → convert per-event micro price to per-1,000 events
		if (pf.feature?.id === 'events' && pf.tiers?.length) {
			// Start tier ranges right after included quota (if any)
			let prevMax: number | undefined =
				typeof pf.included_usage === 'number' ? pf.included_usage : undefined;

			for (const t of pf.tiers) {
				const minValue = prevMax != null ? prevMax + 1 : undefined;
				const maxValue = t.to === 'inf' ? undefined : (t.to as number);

				priceSpecs.push({
					'@type': 'UnitPriceSpecification',
					price: priceStr(t.amount * BLOCK_UNITS_FOR_EVENTS, 2), // e.g. "0.03" per 1,000 events
					priceCurrency: 'USD',
					referenceQuantity: {
						'@type': 'QuantitativeValue',
						value: BLOCK_UNITS_FOR_EVENTS,
						unitText: 'events',
					},
					eligibleQuantity: {
						'@type': 'QuantitativeValue',
						minValue,
						maxValue,
						unitText: 'events',
					},
					unitText: 'per 1,000 events (overage)',
				});

				if (t.to !== 'inf') {
					prevMax = t.to as number;
				}
			}
		}
		// Other priced features (e.g., extra websites per month)
		else if (typeof pf.price === 'number') {
			const refUnit = toUnitCode(pf.interval);
			priceSpecs.push({
				'@type': 'UnitPriceSpecification',
				price: priceStr(pf.price, 2), // e.g. "0.50"
				priceCurrency: 'USD',
				unitText: `per ${pf.feature?.display?.singular ?? 'unit'}`,
				...(refUnit
					? {
							referenceQuantity: {
								'@type': 'QuantitativeValue',
								value: 1,
								unitCode: refUnit, // MON or DAY
							},
						}
					: {}),
			});
		}
	}

	return {
		'@type': 'Offer',
		name: plan.name,
		url: `${baseUrl}/pricing#${plan.id}`,
		price: basePrice, // simple base price (numeric) for the plan itself
		priceCurrency: 'USD',
		priceSpecification: priceSpecs,
		itemOffered: {
			'@type': 'SoftwareApplication',
			name: 'Databuddy',
			operatingSystem: 'Web',
			applicationCategory: 'BusinessApplication',
			url: baseUrl,
		},
		additionalProperty: included.length ? included : undefined,
	};
}

export function StructuredData({
	baseUrl = 'https://www.databuddy.cc',
	logoUrl = `${'https://www.databuddy.cc'}/logo.png`,
	page,
	elements = [],
}: StructuredDataProps) {
	const abs = (u?: string) =>
		u ? (u.startsWith('http') ? u : `${baseUrl}${u}`) : undefined;
	const pageUrl = abs(page.url) ?? baseUrl;
	const lang = page.inLanguage || 'en';

	const orgId = `${baseUrl}#organization`;
	const websiteId = `${baseUrl}#website`;
	const webPageId = `${pageUrl}#webpage`;
	const breadcrumbId = `${pageUrl}#breadcrumb`;
	const faqId = `${pageUrl}#faq`;
	const softwareId = `${baseUrl}#software`;

	const graph: any[] = [];

	// Organization (always)
	graph.push({
		'@type': 'Organization',
		'@id': orgId,
		name: 'Databuddy',
		url: baseUrl,
		logo: { '@type': 'ImageObject', url: logoUrl },
		contactPoint: {
			'@type': 'ContactPoint',
			contactType: 'Customer Support',
			email: 'support@databuddy.cc',
		},
	});

	// WebSite (always)
	graph.push({
		'@type': 'WebSite',
		'@id': websiteId,
		url: baseUrl,
		name: 'Databuddy',
		publisher: { '@id': orgId },
	});

	// WebPage (anchor)
	graph.push({
		'@type': 'WebPage',
		'@id': webPageId,
		url: pageUrl,
		name: page.title,
		description: page.description,
		isPartOf: { '@id': websiteId },
		about: { '@id': orgId },
		breadcrumb: page.breadcrumbs?.length ? { '@id': breadcrumbId } : undefined,
		datePublished: page.datePublished,
		dateModified: page.dateModified || page.datePublished,
		image: page.imageUrl
			? { '@type': 'ImageObject', url: abs(page.imageUrl) }
			: undefined,
		inLanguage: lang,
	});

	// Breadcrumbs
	if (page.breadcrumbs?.length) {
		graph.push({
			'@type': 'BreadcrumbList',
			'@id': breadcrumbId,
			itemListElement: page.breadcrumbs.map((crumb, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				name: crumb.name,
				item: abs(crumb.url),
			})),
		});
	}

	// Collect FAQ items across all elements, then emit once
	const faqItems: FAQItem[] = [];

	for (const el of elements) {
		if (el.type === 'article') {
			const a = el.value;
			graph.push({
				'@type': ['BlogPosting', 'Article'],
				headline: a.title,
				description: a.description,
				url: pageUrl,
				mainEntityOfPage: { '@id': webPageId },
				isPartOf: { '@id': websiteId },
				author: { '@type': 'Organization', '@id': orgId, name: 'Databuddy' },
				publisher: { '@type': 'Organization', '@id': orgId },
				image: a.imageUrl
					? { '@type': 'ImageObject', url: abs(a.imageUrl) }
					: undefined,
				datePublished: a.datePublished,
				dateModified: a.dateModified || a.datePublished,
				inLanguage: lang,
			});
		} else if (el.type === 'documentation') {
			const d = el.value;
			graph.push({
				'@type': ['TechArticle', 'Article'],
				headline: d.title,
				description: d.description,
				url: pageUrl,
				mainEntityOfPage: { '@id': webPageId },
				isPartOf: { '@id': websiteId },
				author: {
					'@type': 'Organization',
					'@id': orgId,
					name: 'Databuddy',
					url: baseUrl,
				},
				publisher: { '@type': 'Organization', '@id': orgId },
				image: d.imageUrl
					? { '@type': 'ImageObject', url: abs(d.imageUrl) }
					: undefined,
				datePublished: d.datePublished,
				dateModified: d.dateModified || d.datePublished,
				articleSection: d.section ?? 'Documentation',
				keywords: d.keywords ?? [
					'analytics',
					'privacy-first',
					'web analytics',
					'GDPR',
					'documentation',
				],
				inLanguage: lang,
			});
		} else if (el.type === 'faq') {
			faqItems.push(...el.items);
		} else if (el.type === 'softwareOffers') {
			const offers = el.plans.map((p) => planToOffer(p, baseUrl));

			graph.push({
				'@type': 'SoftwareApplication',
				'@id': softwareId,
				name: el.name ?? 'Databuddy',
				applicationCategory: 'BusinessApplication',
				operatingSystem: 'Web',
				url: baseUrl,
				publisher: { '@type': 'Organization', '@id': orgId },
				// Multiple plans → AggregateOffer
				offers: {
					'@type': 'AggregateOffer',
					offerCount: offers.length,
					lowPrice: Math.min(
						...offers.map((o) => Number(o.price ?? 0))
					).toFixed(2),
					highPrice: Math.max(
						...offers.map((o) => Number(o.price ?? 0))
					).toFixed(2),
					priceCurrency: 'USD',
					offers,
				},
			});
		}
	}

	if (faqItems.length) {
		graph.push({
			'@type': 'FAQPage',
			'@id': faqId,
			mainEntity: faqItems.map((f) => ({
				'@type': 'Question',
				name: f.question,
				acceptedAnswer: { '@type': 'Answer', text: f.answer },
			})),
		});
	}

	const jsonLd = {
		'@context': 'https://schema.org',
		'@graph': graph.filter(Boolean),
	};

	return (
		<Script
			dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			id="structured-data-page"
			type="application/ld+json"
		/>
	);
}

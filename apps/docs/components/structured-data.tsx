import Script from 'next/script';

interface StructuredDataProps {
	type: 'documentation' | 'article' | 'breadcrumb';
	title?: string;
	description?: string;
	url?: string;
	breadcrumbs?: Array<{ name: string; url: string }>;
	datePublished?: string;
	dateModified?: string;
}

export function StructuredData({
	type,
	title,
	description,
	url,
	breadcrumbs,
	datePublished,
	dateModified,
}: StructuredDataProps) {
	const getStructuredData = () => {
		const baseData = {
			'@context': 'https://schema.org',
		};

		switch (type) {
			case 'documentation':
				return {
					...baseData,
					'@type': 'TechArticle',
					headline: title,
					description,
					url,
					author: {
						'@type': 'Organization',
						name: 'Databuddy',
						url: 'https://www.databuddy.cc',
					},
					publisher: {
						'@type': 'Organization',
						name: 'Databuddy',
						url: 'https://www.databuddy.cc',
						logo: {
							'@type': 'ImageObject',
							url: 'https://www.databuddy.cc/logo.png',
						},
					},
					datePublished,
					dateModified: dateModified || datePublished,
					mainEntityOfPage: {
						'@type': 'WebPage',
						'@id': url,
					},
					articleSection: 'Documentation',
					keywords: [
						'analytics',
						'privacy-first',
						'web analytics',
						'GDPR',
						'documentation',
					],
				};

			case 'breadcrumb':
				return {
					...baseData,
					'@type': 'BreadcrumbList',
					itemListElement: breadcrumbs?.map((crumb, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: crumb.name,
						item: `https://www.databuddy.cc${crumb.url}`,
					})),
				};

			case 'article':
				return {
					...baseData,
					'@type': 'Article',
					headline: title,
					description,
					url,
					author: {
						'@type': 'Organization',
						name: 'Databuddy Team',
					},
					publisher: {
						'@type': 'Organization',
						name: 'Databuddy',
						logo: {
							'@type': 'ImageObject',
							url: 'https://www.databuddy.cc/logo.png',
						},
					},
					datePublished,
					dateModified: dateModified || datePublished,
				};

			default:
				return baseData;
		}
	};

	return (
		<Script
			// biome-ignore lint: false positive
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(getStructuredData()),
			}}
			id={`structured-data-${type}`}
			type="application/ld+json"
		/>
	);
}

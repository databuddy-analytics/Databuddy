import {
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import { SITE_URL } from "@/app/util/constants";

const investigationPrice = `${INVESTIGATION_ALLOWANCES.intelligence}/month on Business, ${INVESTIGATION_ALLOWANCES.intelligence_scale}/month on Scale · $${INVESTIGATION_USAGE.priceUsd} per additional investigation, billed monthly`;

export const comparisonsReviewedAt = "2026-10-02";

export interface ComparisonFeature {
	benefit: string;
	competitor: boolean;
	databuddy: boolean;
	name: string;
}

export interface CompetitorInfo {
	color: string;
	description: string;
	name: string;
	pricing: {
		starting: string;
		note?: string;
	};
	slug: string;
	tagline: string;
	website: string;
}

export interface FaqItem {
	answer: string;
	question: string;
}

export interface PricingTier {
	competitor: string;
	databuddy: string;
	pageviews: string;
}

export interface ComparisonVerdict {
	competitor: string[];
	databuddy: string[];
}

export interface ComparisonData {
	competitor: CompetitorInfo;
	faqs: FaqItem[];
	features: ComparisonFeature[];
	hero: {
		title: string;
		description: string;
	};
	pricingTiers: PricingTier[];
	seo: {
		title: string;
		description: string;
	};
	sources: { label: string; href: string }[];
	verdict: ComparisonVerdict;
}

export const competitors: Record<string, ComparisonData> = {
	"google-analytics": {
		competitor: {
			name: "Google Analytics",
			slug: "google-analytics",
			description: "Google's web analytics platform",
			website: "https://analytics.google.com",
			tagline: "Web analytics and advertising integrations",
			color: "#E37400",
			pricing: {
				starting: "Free",
				note: "Standard is free; Analytics 360 has separate commercial terms.",
			},
		},
		hero: {
			title: "Databuddy vs Google Analytics",
			description:
				"Compare Google Analytics reporting and advertising integrations with Databuddy’s analytics, error tracking, and AI analysis.",
		},
		seo: {
			title: "Google Analytics alternative: Databuddy vs GA4 (2026)",
			description:
				"Databuddy vs GA4: cookieless analytics with funnels and goals, an AI analyst that shows its query, and uptime and feature flags built in. Free to 10,000 events.",
		},
		verdict: {
			competitor: [
				"You run Google Ads and want GA4’s advertising integrations.",
				"You want to export raw events to BigQuery.",
			],
			databuddy: [
				"You want cookieless tracking by default, not only when a visitor denies consent.",
				"You want to ask Databunny, the built-in AI analyst, about your numbers and see the query behind each answer.",
				"You want uptime monitoring and feature flags in the same dashboard as your analytics.",
			],
		},
		features: [
			{
				name: "Cookieless measurement",
				databuddy: true,
				competitor: true,
				benefit:
					"GA4 advanced consent mode sends cookieless pings when consent is denied; its behavior differs from standard cookie-based collection.",
			},
			{
				name: "Custom events",
				databuddy: true,
				competitor: true,
				benefit:
					"Both collect custom events; event definitions and reporting differ.",
			},
			{
				name: "Real-time reports",
				databuddy: true,
				competitor: true,
				benefit: "Both provide reports of recent visitor activity.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: false,
				benefit:
					"Databuddy is open source; a packaged self-host release is pending. Google Analytics is a hosted service.",
			},
			{
				name: "Raw data export",
				databuddy: true,
				competitor: true,
				benefit:
					"GA4 exports events to BigQuery. Databuddy provides analytics APIs and exports.",
			},
		],
		faqs: [
			{
				question: "Does Google Analytics work without cookies?",
				answer:
					"GA4 uses first-party cookies in its standard setup. Advanced consent mode can send cookieless measurements when consent is denied. Databuddy’s browser tracker uses localStorage and sessionStorage instead of analytics cookies.",
			},
			{
				question: "How long does GA4 retain data?",
				answer:
					"Standard GA4 offers 2- or 14-month retention for user- and event-level data. That setting does not limit standard aggregated reports.",
			},
			{
				question: "Does cookieless analytics remove the need for consent?",
				answer:
					"No automatic exemption follows from being cookieless. Assess the information collected, browser storage, enabled features, and applicable rules.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free · Standard is free; Analytics 360 has separate commercial terms.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Consent mode",
				href: "https://developers.google.com/tag-platform/security/concepts/consent-mode",
			},
			{
				label: "Data retention",
				href: "https://support.google.com/analytics/answer/7667196?hl=en",
			},
		],
	},
	plausible: {
		competitor: {
			name: "Plausible",
			slug: "plausible",
			description: "Privacy-focused web analytics",
			website: "https://plausible.io",
			tagline: "Cookieless web analytics",
			color: "#5850EC",
			pricing: {
				starting: "$9/month",
				note: "Starter at 10,000 monthly pageviews, billed monthly.",
			},
		},
		hero: {
			title: "Databuddy vs Plausible",
			description:
				"Compare Plausible’s web analytics with Databuddy’s analytics, optional identified-user profiles, and investigations.",
		},
		seo: {
			title: "Plausible alternative: Databuddy vs Plausible (2026)",
			description:
				"Databuddy vs Plausible: both are cookieless and open source, with funnels and custom properties. Databuddy also links events to identified-user profiles.",
		},
		verdict: {
			competitor: [
				"You want simple traffic reports from a tool that excludes persistent user identifiers.",
				"You want to self-host today with Plausible Community Edition.",
			],
			databuddy: [
				"You want to link activity to signed-in users with identified-user profiles.",
				"You want error tracking, uptime monitoring, and feature flags in the same dashboard.",
				"You want to start on a free plan with 10,000 events a month.",
			],
		},
		features: [
			{
				name: "Cookieless analytics",
				databuddy: true,
				competitor: true,
				benefit:
					"Both provide analytics without analytics cookies. Consent requirements depend on configuration and applicable rules.",
			},
			{
				name: "Funnels and journeys",
				databuddy: true,
				competitor: true,
				benefit: "Plausible includes funnels and user journeys on Business.",
			},
			{
				name: "Custom event properties",
				databuddy: true,
				competitor: true,
				benefit: "Plausible includes custom properties on Business.",
			},
			{
				name: "Identified-user profiles",
				databuddy: true,
				competitor: false,
				benefit:
					"Databuddy can link activity to supplied user IDs. Plausible excludes persistent user identifiers.",
			},
			{
				name: "Raw event exports",
				databuddy: true,
				competitor: true,
				benefit: "Plausible offers scheduled raw event exports on Enterprise.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: true,
				benefit:
					"Plausible Community Edition is open source and self-hostable. Databuddy is open source; a packaged self-host release is pending.",
			},
		],
		faqs: [
			{
				question: "Does Plausible support funnels and custom properties?",
				answer:
					"Yes. Plausible Business includes funnels, user journeys, custom properties, and revenue attribution. Databuddy also includes funnels, with limits that vary by plan.",
			},
			{
				question: "Can Plausible export raw events?",
				answer:
					"Yes. Enterprise supports scheduled raw event exports. Standard CSV statistics exports are also available.",
			},
			{
				question: "How do user profiles differ?",
				answer:
					"Databuddy can link activity to user IDs and traits you supply. Plausible excludes persistent user identifiers and prohibits them in custom properties.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"$9/month · Starter at 10,000 monthly pageviews, billed monthly.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Plans and pricing",
				href: "https://plausible.io/#pricing",
			},
			{
				label: "Custom properties",
				href: "https://plausible.io/docs/custom-props/introduction",
			},
			{
				label: "Raw exports",
				href: "https://plausible.io/docs/raw-data-export",
			},
		],
	},
	fathom: {
		competitor: {
			name: "Fathom Analytics",
			slug: "fathom",
			description: "Simple, privacy-focused website analytics",
			website: "https://usefathom.com",
			tagline: "Hosted cookieless web analytics",
			color: "#9187FF",
			pricing: {
				starting: "$15/month",
				note: "100,000 monthly pageviews, billed monthly in USD; custom events count toward the allowance.",
			},
		},
		hero: {
			title: "Databuddy vs Fathom Analytics",
			description:
				"Compare Fathom’s web analytics with Databuddy’s funnels, error tracking, and investigations.",
		},
		seo: {
			title: "Fathom alternative: Databuddy vs Fathom Analytics (2026)",
			description:
				"Databuddy vs Fathom: both are cookieless, with conversion goals and CSV exports. Databuddy adds a multi-step funnel builder and a Free plan with 10,000 events.",
		},
		verdict: {
			competitor: [
				"You want hosted traffic analytics with 100,000 monthly pageviews from $15 a month.",
				"Conversion goals cover what you measure, and you don’t need multi-step funnels.",
			],
			databuddy: [
				"You want a multi-step funnel builder on top of conversion goals.",
				"You want to start on a free plan with 10,000 events a month instead of a trial.",
				"You want user profiles, error tracking, and feature flags next to your traffic data.",
			],
		},
		features: [
			{
				name: "Cookieless analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both collect analytics without analytics cookies.",
			},
			{
				name: "Conversion goals",
				databuddy: true,
				competitor: true,
				benefit: "Fathom tracks conversions through events.",
			},
			{
				name: "Multi-step funnel builder",
				databuddy: true,
				competitor: false,
				benefit:
					"Databuddy provides a funnel builder in addition to individual conversion goals.",
			},
			{
				name: "Data exports",
				databuddy: true,
				competitor: true,
				benefit:
					"Fathom exports aggregated pageview and event statistics as CSV.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: false,
				benefit:
					"Commercial Fathom is hosted; Fathom Lite is a separate self-hosted project. Databuddy is open source; a packaged self-host release is pending.",
			},
			{
				name: "Free hosted plan",
				databuddy: true,
				competitor: false,
				benefit:
					"Databuddy includes 10,000 monthly events free. Commercial Fathom offers a trial.",
			},
		],
		faqs: [
			{
				question: "Can Fathom track conversions?",
				answer:
					"Yes. Fathom tracks conversion goals through events. Databuddy also includes a multi-step funnel builder.",
			},
			{
				question: "Can I self-host Fathom?",
				answer:
					"The commercial Fathom product is hosted. The older Fathom Lite project can be self-hosted; it is a separate product.",
			},
			{
				question: "How should I compare costs?",
				answer:
					"Count pageviews and custom events for both products. Fathom includes events in its pageview allowance; Databuddy counts them as events. Compare the features and traffic you actually need.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"$15/month · 100,000 monthly pageviews, billed monthly in USD; custom events count toward the allowance.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Pricing",
				href: "https://usefathom.com/pricing",
			},
			{
				label: "Events and goals",
				href: "https://usefathom.com/docs/events/overview",
			},
			{
				label: "Feature availability",
				href: "https://usefathom.com/docs/troubleshooting/features",
			},
		],
	},
	posthog: {
		competitor: {
			name: "PostHog",
			slug: "posthog",
			description: "Open-source product analytics suite",
			website: "https://posthog.com",
			tagline: "Analytics, replay, experiments, and AI",
			color: "#F54E00",
			pricing: {
				starting: "Free plan",
				note: "Products have separate free allowances and usage pricing.",
			},
		},
		hero: {
			title: "Databuddy vs PostHog",
			description:
				"PostHog combines analytics, replay, experiments, surveys, and AI. Databuddy combines analytics, errors, monitoring, and investigations in one dashboard.",
		},
		seo: {
			title: "PostHog alternative: Databuddy vs PostHog (2026)",
			description:
				"Databuddy vs PostHog: both track product events, run feature flags, and have AI. Databuddy is one cookieless script; PostHog adds replay and surveys.",
		},
		verdict: {
			competitor: [
				"You need session replay or in-app surveys.",
				"You run experiments and want PostHog’s experiment analysis engine.",
			],
			databuddy: [
				"You want one cookieless script for traffic, custom events, funnels, and goals.",
				"You want pageviews, custom events, errors, and Web Vitals to share one event allowance.",
				"You want uptime monitoring next to your product analytics, errors, and feature flags.",
			],
		},
		features: [
			{
				name: "AI analysis and investigations",
				databuddy: true,
				competitor: true,
				benefit:
					"Both offer AI analysis and investigation workflows. Compare the evidence and actions each produces for your use case.",
			},
			{
				name: "Web and product analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both connect traffic reports with product events.",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit: "Both support targeted flags and gradual rollouts.",
			},
			{
				name: "Weighted variants",
				databuddy: true,
				competitor: true,
				benefit:
					"Both support variant assignment. PostHog also provides an experiment analysis engine.",
			},
			{
				name: "Session replay",
				databuddy: false,
				competitor: true,
				benefit: "PostHog records and replays user sessions.",
			},
			{
				name: "In-app surveys",
				databuddy: false,
				competitor: true,
				benefit: "PostHog includes surveys for collecting user feedback.",
			},
		],
		faqs: [
			{
				question: "Do both products offer AI analysis?",
				answer:
					"Yes. Both offer AI-assisted analytics and investigations. Evaluate them against the same questions and data; a feature checkbox does not establish answer quality.",
			},
			{
				question: "Does Databuddy have session replay or surveys?",
				answer:
					"Databuddy does not provide session replay or in-app surveys. PostHog includes both.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free plan · Products have separate free allowances and usage pricing.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "Available; see current AI terms",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Product capabilities",
				href: "https://posthog.com/",
			},
			{
				label: "Product pricing",
				href: "https://posthog.com/pricing/",
			},
		],
	},
	umami: {
		competitor: {
			name: "Umami",
			slug: "umami",
			description: "Simple, fast, privacy-focused web analytics",
			website: "https://umami.is",
			tagline: "Open-source web and product analytics",
			color: "#000000",
			pricing: {
				starting: "Free plan",
				note: "Cloud Hobby includes 100,000 monthly events; Pro starts at $20/month.",
			},
		},
		hero: {
			title: "Databuddy vs Umami",
			description:
				"Compare Umami’s analytics with Databuddy’s investigations, feature flags, and error tracking.",
		},
		seo: {
			title: "Umami alternative: Databuddy vs Umami (2026)",
			description:
				"Databuddy vs Umami: both have funnels, goals, identified users, event properties, exports, and MCP access. Compare features, pricing, and when to pick each.",
		},
		verdict: {
			competitor: [
				"You want to self-host today under the MIT license.",
				"You want a free cloud tier with 100,000 monthly events, funnels, and goals.",
			],
			databuddy: [
				"You want feature flags, error tracking, and uptime monitoring in the same dashboard as your analytics.",
				"You want Databunny, the built-in AI analyst, to answer questions and show the query behind each answer.",
				"You want scheduled investigations: Business and Scale check your metrics daily or weekly, comparing the last 7 days with the prior 7.",
			],
		},
		features: [
			{
				name: "Funnels and goals",
				databuddy: true,
				competitor: true,
				benefit:
					"Both measure conversion steps and goals. Umami includes these on its free Cloud tier.",
			},
			{
				name: "Identified-user profiles",
				databuddy: true,
				competitor: true,
				benefit:
					"Both can associate events and sessions with identified users.",
			},
			{
				name: "Custom event properties",
				databuddy: true,
				competitor: true,
				benefit: "Both accept event properties for filtering and analysis.",
			},
			{
				name: "MCP access",
				databuddy: true,
				competitor: true,
				benefit:
					"Both expose tools for external AI assistants. Umami Cloud MCP starts on Pro.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: true,
				benefit:
					"Umami is MIT-licensed and self-hostable. Databuddy is open source under AGPL-3.0; a packaged self-host release is pending.",
			},
			{
				name: "Data exports",
				databuddy: true,
				competitor: true,
				benefit:
					"Umami Cloud exports pageviews, events, sessions, and event data.",
			},
		],
		faqs: [
			{
				question: "Does Umami support identified users?",
				answer:
					"Yes. Umami supports distinct user IDs, session properties, and activity histories across sessions and devices.",
			},
			{
				question: "Does Umami include funnels and AI integrations?",
				answer:
					"Umami includes funnels and goals on its free Cloud tier. Its MCP server lets external assistants query analytics; Cloud MCP starts on Pro.",
			},
			{
				question: "What does Databuddy add?",
				answer:
					"Databuddy brings feature flags, error tracking, uptime monitoring, Databunny chat, and scheduled investigation workflows into the same dashboard. Investigations are included on the Business and Scale plans.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free plan · Cloud Hobby includes 100,000 monthly events; Pro starts at $20/month.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Pricing",
				href: "https://umami.is/pricing",
			},
			{
				label: "Identification",
				href: "https://docs.umami.is/docs/guides/identify-logged-in-users",
			},
			{
				label: "MCP",
				href: "https://docs.umami.is/docs/cloud/mcp",
			},
		],
	},
	mixpanel: {
		competitor: {
			name: "Mixpanel",
			slug: "mixpanel",
			description: "Product analytics for product-led growth",
			website: "https://mixpanel.com",
			tagline: "Product analytics, cohorts, and AI",
			color: "#7856FF",
			pricing: {
				starting: "Free plan",
				note: "Free includes 1 million monthly events; paid pricing scales with usage.",
			},
		},
		hero: {
			title: "Databuddy vs Mixpanel",
			description:
				"Compare Mixpanel’s product and web analytics, cohorts, and AI agents with Databuddy’s analytics, monitoring, and investigations.",
		},
		seo: {
			title: "Mixpanel alternative: Databuddy vs Mixpanel (2026)",
			description:
				"Databuddy vs Mixpanel: both have web analytics, funnels, flags, identified users, and AI analysis. Mixpanel adds cohorts; Databuddy is one cookieless script.",
		},
		verdict: {
			competitor: [
				"You need behavioral cohorts and audience segmentation.",
				"You expect more than 10,000 events a month on a free plan; Mixpanel Free includes 1 million.",
			],
			databuddy: [
				"You want one cookieless script for traffic, events, funnels, and goals.",
				"You want uptime monitoring and error tracking next to your product analytics.",
				"You want analytics code you can read: Databuddy is open source under AGPL-3.0.",
			],
		},
		features: [
			{
				name: "AI analysis",
				databuddy: true,
				competitor: true,
				benefit:
					"Mixpanel Agents provide AI-assisted analytics. Databuddy provides chat and investigation workflows.",
			},
			{
				name: "Web analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both report on web traffic, pageviews, and acquisition.",
			},
			{
				name: "Funnels",
				databuddy: true,
				competitor: true,
				benefit: "Both measure conversion steps.",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit: "Both offer feature flags, with plan-specific limits.",
			},
			{
				name: "Identified users",
				databuddy: true,
				competitor: true,
				benefit: "Both can associate events with supplied user IDs.",
			},
			{
				name: "Behavioral cohorts",
				databuddy: false,
				competitor: true,
				benefit: "Mixpanel provides cohort analysis and audience segmentation.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: false,
				benefit:
					"Databuddy is open source; a packaged self-host release is pending. Mixpanel is a hosted platform.",
			},
		],
		faqs: [
			{
				question: "Does Mixpanel have web analytics and feature flags?",
				answer:
					"Yes. Mixpanel offers web analytics and feature flags alongside product analytics, with plan-specific limits.",
			},
			{
				question: "Does Mixpanel have AI analytics?",
				answer:
					"Yes. Mixpanel Agents provide AI-assisted analysis. Databuddy provides Databunny chat and scheduled investigation workflows.",
			},
			{
				question: "How do the free plans compare?",
				answer:
					"Mixpanel includes 1 million monthly events on Free. Databuddy includes 10,000 monthly events, Databunny chat, and limited funnels, goals, and flags. Compare the capabilities you need as well as event volume.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free plan · Free includes 1 million monthly events; paid pricing scales with usage.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "AI agents available; see current plan terms",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Pricing",
				href: "https://mixpanel.com/pricing/",
			},
			{
				label: "Agents",
				href: "https://mixpanel.com/ai/agents",
			},
			{
				label: "Web analytics",
				href: "https://mixpanel.com/platform/web-analytics/",
			},
		],
	},
	amplitude: {
		competitor: {
			name: "Amplitude",
			slug: "amplitude",
			description: "Enterprise behavioral analytics platform",
			website: "https://amplitude.com",
			tagline: "Product analytics and experimentation",
			color: "#1E61F0",
			pricing: {
				starting: "Free plan",
				note: "Starter includes 2 million monthly events. Paid pricing depends on usage and plan.",
			},
		},
		hero: {
			title: "Databuddy vs Amplitude",
			description:
				"Compare Amplitude’s product analytics, cohorts, replay, experiments, and AI agents with Databuddy’s analytics and investigation workflows.",
		},
		seo: {
			title: "Amplitude alternative: Databuddy vs Amplitude (2026)",
			description:
				"Databuddy vs Amplitude: both have AI analysis, feature flags, and custom events. Amplitude adds session replay and cohorts; Databuddy is one cookieless script.",
		},
		verdict: {
			competitor: [
				"You need session replay, behavioral cohorts, or an experimentation suite.",
				"You want autocapture on top of custom event tracking.",
			],
			databuddy: [
				"You want error tracking and uptime monitoring in the same dashboard as your analytics.",
				"You want one cookieless script for traffic, events, funnels, and goals.",
				"You want analytics code you can read: Databuddy is open source under AGPL-3.0.",
			],
		},
		features: [
			{
				name: "Conversational AI analysis",
				databuddy: true,
				competitor: true,
				benefit: "Both offer natural-language analysis.",
			},
			{
				name: "Scheduled AI analysis",
				databuddy: true,
				competitor: true,
				benefit:
					"Amplitude agents can analyze dashboards and replays on a schedule and deliver results to Slack or email.",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit: "Amplitude Experiment provides flags and experimentation.",
			},
			{
				name: "Custom events",
				databuddy: true,
				competitor: true,
				benefit:
					"Both support event instrumentation; Amplitude also offers autocapture.",
			},
			{
				name: "Behavioral cohorts",
				databuddy: false,
				competitor: true,
				benefit: "Amplitude provides dedicated cohort analysis.",
			},
			{
				name: "Session replay",
				databuddy: false,
				competitor: true,
				benefit: "Amplitude includes session replay.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: false,
				benefit:
					"Databuddy is open source; a packaged self-host release is pending. Amplitude is hosted.",
			},
		],
		faqs: [
			{
				question: "Does Amplitude run scheduled AI analysis?",
				answer:
					"Yes. Amplitude agents support scheduled and on-demand analysis of dashboards, session replays, and websites, with Slack and email delivery.",
			},
			{
				question: "Does Amplitude require manual event instrumentation?",
				answer:
					"Amplitude supports autocapture as well as custom event instrumentation. Both tools still need event definitions that match the product questions you want to answer.",
			},
			{
				question: "What does Amplitude offer beyond Databuddy?",
				answer:
					"Amplitude provides dedicated cohort analysis, session replay, and an experimentation suite. Databuddy includes error tracking and uptime monitoring, and its code is open source.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free plan · Starter includes 2 million monthly events. Paid pricing depends on usage and plan.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "Scheduled agents available; see current plan terms",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Plans",
				href: "https://amplitude.com/pricing",
			},
			{
				label: "AI agents",
				href: "https://amplitude.com/docs/amplitude-ai/setup-and-onboarding",
			},
			{
				label: "Autocapture",
				href: "https://amplitude.com/docs/get-started/autocapture",
			},
		],
	},
	rybbit: {
		competitor: {
			name: "Rybbit",
			slug: "rybbit",
			description: "Modern, open-source web analytics",
			website: "https://rybbit.com",
			tagline: "Analytics, replay, and retention",
			color: "#0a3a3a",
			pricing: {
				starting: "Paid cloud plans",
				note: "Managed cloud prices depend on traffic and billing interval; self-hosting is also available.",
			},
		},
		hero: {
			title: "Databuddy vs Rybbit",
			description:
				"Both offer cookieless analytics, identified profiles, funnels, and MCP access. Rybbit adds replay and retention; Databuddy adds flags and investigation workflows.",
		},
		seo: {
			title: "Rybbit alternative: Databuddy vs Rybbit (2026)",
			description:
				"Databuddy vs Rybbit: both are cookieless, with identified profiles, funnels, MCP access, and managed cloud. Rybbit adds session replay and retention reports.",
		},
		verdict: {
			competitor: [
				"You need session replay or retention reports.",
				"You want to self-host today with Rybbit’s open-source release.",
			],
			databuddy: [
				"You want feature flags, uptime monitoring, and short links in the same dashboard.",
				"You want to start on a free hosted plan with 10,000 events a month.",
				"You want Databunny, the built-in AI analyst, to answer questions and show the query behind each answer.",
			],
		},
		features: [
			{
				name: "Cookieless analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both collect analytics without analytics cookies.",
			},
			{
				name: "Identified-user profiles",
				databuddy: true,
				competitor: true,
				benefit:
					"Both support optional identified users and activity histories.",
			},
			{
				name: "Funnels",
				databuddy: true,
				competitor: true,
				benefit:
					"Both track conversion paths; Rybbit also has retention reports.",
			},
			{
				name: "MCP access",
				databuddy: true,
				competitor: true,
				benefit:
					"Rybbit and Databuddy provide analytics tools for external AI assistants.",
			},
			{
				name: "Managed cloud",
				databuddy: true,
				competitor: true,
				benefit:
					"Both offer managed hosting. Rybbit has published Standard, Pro, and Enterprise plans.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: true,
				benefit:
					"Rybbit publishes an open-source self-hosted version. Databuddy is open source; a packaged self-host release is pending.",
			},
			{
				name: "Session replay",
				databuddy: false,
				competitor: true,
				benefit: "Rybbit offers session replay.",
			},
		],
		faqs: [
			{
				question: "Does Rybbit identify users and support product analytics?",
				answer:
					"Yes. Rybbit supports identified profiles, user journeys, funnels, retention, and session replay.",
			},
			{
				question: "Does Rybbit connect to AI assistants?",
				answer:
					"Yes. Its hosted MCP server exposes analytics and management tools to external assistants. Databuddy also provides its own chat and scheduled investigation workflows.",
			},
			{
				question: "Is Rybbit available as a hosted service?",
				answer:
					"Yes. Rybbit publishes managed Standard, Pro, and Enterprise plans as well as a self-hosted version.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Paid cloud plans · Managed cloud prices depend on traffic and billing interval; self-hosting is also available.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Pricing",
				href: "https://rybbit.com/pricing",
			},
			{
				label: "User profiles",
				href: "https://rybbit.com/features/user-profiles",
			},
			{
				label: "MCP",
				href: "https://rybbit.com/docs/mcp",
			},
		],
	},
	"vercel-analytics": {
		competitor: {
			name: "Vercel Analytics",
			slug: "vercel-analytics",
			description: "Built-in analytics for Vercel deployments",
			website: "https://vercel.com/analytics",
			tagline: "Analytics integrated with Vercel projects",
			color: "#000000",
			pricing: {
				starting: "Included allowances",
				note: "Usage and feature limits depend on the Vercel plan and product.",
			},
		},
		hero: {
			title: "Databuddy vs Vercel Analytics",
			description:
				"Compare Vercel’s integrated Web Analytics and related platform tools with Databuddy’s analytics, errors, and investigations across hosting providers.",
		},
		seo: {
			title: "Vercel Analytics alternative: Databuddy vs Vercel (2026)",
			description:
				"Databuddy vs Vercel Analytics: both are cookieless, with custom events, Next.js support, Web Vitals, and flags. Databuddy works on any host. Free to 10,000 events.",
		},
		verdict: {
			competitor: [
				"Your sites run on Vercel and you want analytics inside your Vercel projects.",
				"You already use Speed Insights and Vercel Flags.",
			],
			databuddy: [
				"You host on more than one provider and want one dashboard for every site.",
				"You want to ask Databunny, the built-in AI analyst, about your traffic and see the query behind each answer.",
				"You want uptime monitoring and short links in the same dashboard as your analytics.",
			],
		},
		features: [
			{
				name: "Cookieless analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both collect analytics without analytics cookies.",
			},
			{
				name: "Custom events",
				databuddy: true,
				competitor: true,
				benefit:
					"Vercel Web Analytics custom events are available on Pro and Enterprise.",
			},
			{
				name: "Next.js integration",
				databuddy: true,
				competitor: true,
				benefit: "Both support Next.js applications.",
			},
			{
				name: "Core Web Vitals",
				databuddy: true,
				competitor: true,
				benefit:
					"Vercel provides these through the separate Speed Insights product.",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit:
					"Vercel Flags is a separate platform product that integrates with Web Analytics.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: false,
				benefit:
					"Databuddy is open source; a packaged self-host release is pending. Vercel Web Analytics integrates with Vercel projects.",
			},
		],
		faqs: [
			{
				question: "Does Vercel Web Analytics support custom events?",
				answer:
					"Yes. Custom events are available on Pro and Enterprise. Web Analytics reports traffic and events; Core Web Vitals are provided by the separate Speed Insights product.",
			},
			{
				question: "Does Vercel offer feature flags?",
				answer:
					"Yes. Vercel Flags is a separate platform product that integrates with Web Analytics.",
			},
			{
				question: "Can I use Databuddy with Next.js?",
				answer:
					"Yes. Databuddy supports Next.js and can collect analytics from sites on different hosting providers. Vercel Web Analytics is integrated with Vercel projects.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Included allowances · Usage and feature limits depend on the Vercel plan and product.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Custom events",
				href: "https://vercel.com/docs/analytics/custom-events",
			},
			{
				label: "Speed Insights",
				href: "https://vercel.com/docs/speed-insights",
			},
			{
				label: "Vercel Flags",
				href: "https://vercel.com/docs/flags",
			},
		],
	},
	matomo: {
		competitor: {
			name: "Matomo",
			slug: "matomo",
			description: "Self-hosted web analytics since 2007",
			website: "https://matomo.org",
			tagline: "Hosted and self-hosted analytics",
			color: "#3152A0",
			pricing: {
				starting: "Free self-hosted core",
				note: "Managed hosting and premium features have separate pricing.",
			},
		},
		hero: {
			title: "Databuddy vs Matomo",
			description:
				"Matomo offers managed and self-hosted analytics with an established reporting and plugin ecosystem. Compare that with Databuddy’s analytics and AI workflows.",
		},
		seo: {
			title: "Matomo alternative: Databuddy vs Matomo (2026)",
			description:
				"Databuddy vs Matomo: both track events, goals, and live visits, with reporting APIs. Matomo adds heatmaps and recordings; Databuddy is one cookieless script.",
		},
		verdict: {
			competitor: [
				"You need heatmaps or session recordings.",
				"You want to self-host today on PHP and MySQL, with a large plugin ecosystem.",
			],
			databuddy: [
				"You want to ask Databunny, the built-in AI analyst, about your numbers and see the query behind each answer.",
				"You want feature flags with weighted variants and uptime monitoring in the same dashboard.",
				"You want a hosted plan that starts free at 10,000 events a month.",
			],
		},
		features: [
			{
				name: "Custom events and goals",
				databuddy: true,
				competitor: true,
				benefit: "Both collect events and measure conversions.",
			},
			{
				name: "Real-time reports",
				databuddy: true,
				competitor: true,
				benefit: "Both report recent visitor activity.",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Both provide APIs for reporting and integrations.",
			},
			{
				name: "Heatmaps",
				databuddy: false,
				competitor: true,
				benefit:
					"Matomo offers heatmaps; packaging differs between Cloud and On-Premise.",
			},
			{
				name: "Session recordings",
				databuddy: false,
				competitor: true,
				benefit:
					"Matomo offers recordings; packaging differs between Cloud and On-Premise.",
			},
			{
				name: "Weighted variants",
				databuddy: true,
				competitor: true,
				benefit:
					"Databuddy supports weighted feature flags. Matomo offers a separate A/B testing feature.",
			},
			{
				name: "Self-hosting",
				databuddy: false,
				competitor: true,
				benefit:
					"Matomo offers self-hosted and managed hosting. Databuddy is open source and hosted; a packaged self-host release is pending.",
			},
		],
		faqs: [
			{
				question: "What does Matomo offer beyond Databuddy?",
				answer:
					"Matomo offers heatmaps, session recordings, and a larger reporting and plugin ecosystem. Packaging differs between Cloud and On-Premise.",
			},
			{
				question: "Can I self-host Databuddy like Matomo?",
				answer:
					"Not with a packaged release yet. Databuddy is open source, but its self-host release is pending, so use hosted Databuddy for now. Matomo On-Premise runs on PHP and MySQL.",
			},
			{
				question: "What are Matomo’s AI Assistants reports?",
				answer:
					"These reports measure traffic from AI assistants. They are distinct from Databunny’s conversational analysis and investigation workflows.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Entry options",
				competitor:
					"Free self-hosted core · Managed hosting and premium features have separate pricing.",
				databuddy: "Free · 10,000 monthly events",
			},
			{
				pageviews: "Automatic investigations",
				competitor: "See vendor feature documentation",
				databuddy: investigationPrice,
			},
		],
		sources: [
			{
				label: "Plans and packaging",
				href: "https://matomo.org/pricing/",
			},
			{
				label: "AI Assistants reports",
				href: "https://matomo.org/guide/reports/ai-assistants/",
			},
		],
	},
};

export function getComparisonData(slug: string): ComparisonData | null {
	return competitors[slug] ?? null;
}

export function getAllCompetitorSlugs(): string[] {
	return Object.keys(competitors);
}

const mark = (value: boolean) => (value ? "Yes" : "No");

export function createComparisonMarkdown(
	data: ComparisonData,
	pageUrl: string
): string {
	const { competitor, verdict } = data;
	const bullets = (items: string[]) =>
		items.map((item) => `- ${item}`).join("\n");
	const featureRows = data.features
		.map(
			(feature) =>
				`| ${feature.name} | ${mark(feature.databuddy)} | ${mark(feature.competitor)} | ${feature.benefit} |`
		)
		.join("\n");
	const pricingRows = data.pricingTiers
		.map(
			(tier) => `| ${tier.pageviews} | ${tier.databuddy} | ${tier.competitor} |`
		)
		.join("\n");
	const faqs = data.faqs
		.map((faq) => `### ${faq.question}\n\n${faq.answer}`)
		.join("\n\n");
	const sources = data.sources
		.map((source) => `- [${source.label}](${source.href})`)
		.join("\n");

	return `# ${data.hero.title}

> ${data.seo.description}

Canonical: ${pageUrl}
Last reviewed: ${comparisonsReviewedAt}

## Choose Databuddy if

${bullets(verdict.databuddy)}

## Choose ${competitor.name} if

${bullets(verdict.competitor)}

## Features

| Feature | Databuddy | ${competitor.name} | Notes |
| --- | --- | --- | --- |
${featureRows}

## Pricing

| Plan | Databuddy | ${competitor.name} |
| --- | --- | --- |
${pricingRows}

${competitor.name} starts at ${competitor.pricing.starting}.${competitor.pricing.note ? ` ${competitor.pricing.note}` : ""}

Databuddy pricing: ${SITE_URL}/pricing.md

## FAQ

${faqs}

## Sources

${sources}

Start free: https://app.databuddy.cc/register
`;
}

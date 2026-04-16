export interface ComparisonFeature {
	benefit: string;
	category: "privacy" | "performance" | "features" | "pricing" | "technical";
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

export interface MigrationSection {
	guideHref: string;
	guideLabel: string;
	heading: string;
	steps: string[];
}

export interface ComparisonData {
	competitor: CompetitorInfo;
	faqs: FaqItem[];
	features: ComparisonFeature[];
	hero: {
		title: string;
		description: string;
		cta: string;
	};
	migrationSection?: MigrationSection;
	pricingTiers: PricingTier[];
	seo: {
		title: string;
		description: string;
	};
}

export const competitors: Record<string, ComparisonData> = {
	"google-analytics": {
		competitor: {
			name: "Google Analytics",
			slug: "google-analytics",
			description: "Google's web analytics platform",
			website: "https://analytics.google.com",
			tagline: "The most popular web analytics platform",
			color: "#E37400",
			pricing: {
				starting: "Free",
				note: "With data sampling and limits",
			},
		},
		hero: {
			title: "Databuddy vs Google Analytics",
			description:
				"GA4 is powerful. It's also 45KB of tracking script, a cookie consent requirement, and dozens of configuration steps between you and usable data. Databuddy is 3KB, no banners, and tracking in five minutes.",
			cta: "Switch to privacy-first analytics",
		},
		seo: {
			title: "Databuddy vs Google Analytics: Privacy-First Alternative 2026",
			description:
				"Compare Databuddy and Google Analytics. Discover why businesses are switching to privacy-first analytics with simpler setup, no data sampling, and full data ownership.",
		},
		features: [
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: false,
				benefit:
					"No consent banners — many EU sites lose 30–40% of visits to consent friction; cookieless keeps that traffic",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: false,
				benefit:
					"Austrian DPA and French CNIL have ruled GA4 transfers non-compliant without heavy setup; Databuddy is compliant by design",
				category: "privacy",
			},
			{
				name: "No data sampling",
				databuddy: true,
				competitor: false,
				benefit:
					"Full data at any volume; GA4 UI caps retention at 14 months (25 max) — year-over-year analysis needs BigQuery",
				category: "features",
			},
			{
				name: "Data ownership",
				databuddy: true,
				competitor: false,
				benefit: "Your data stays yours — not shared with ad networks",
				category: "privacy",
			},
			{
				name: "Simple setup",
				databuddy: true,
				competitor: false,
				benefit:
					"One script tag; skip GTM, Consent Mode v2, and GA4's long exploration flows",
				category: "features",
			},
			{
				name: "No ads influence",
				databuddy: true,
				competitor: false,
				benefit: "Pure analytics without advertising bias",
				category: "privacy",
			},
			{
				name: "Predictable costs",
				databuddy: true,
				competitor: false,
				benefit: "No BigQuery bills or consent platform fees",
				category: "pricing",
			},
			{
				name: "Lightweight script",
				databuddy: true,
				competitor: false,
				benefit:
					"3KB vs 45KB+ (gtag + GTM) — lighter JS and better Core Web Vitals",
				category: "performance",
			},
			{
				name: "AI insights (Databunny)",
				databuddy: true,
				competitor: true,
				benefit: "Ask questions in plain English vs navigating complex reports",
				category: "features",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both offer real-time — Databuddy's is simpler to read",
				category: "features",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Simple custom events vs complex GA4 event schema",
				category: "features",
			},
			{
				name: "Custom reports",
				databuddy: true,
				competitor: true,
				benefit: "Ask Databunny vs building 40-step Explorations",
				category: "features",
			},
			{
				name: "Raw data export",
				databuddy: true,
				competitor: true,
				benefit: "Direct export vs requiring a GCP billing account",
				category: "features",
			},
			{
				name: "Multiple domains",
				databuddy: true,
				competitor: true,
				benefit: "Manage all your sites from one dashboard",
				category: "features",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Build custom integrations and dashboards",
				category: "technical",
			},
		],
		faqs: [
			{
				question: "Is Google Analytics GDPR compliant?",
				answer:
					"GA4 has been ruled illegal by multiple EU data protection authorities (Austria, France, Italy, Denmark) without extensive configuration. Databuddy is GDPR compliant by default — no cookies, no personal data collection, no configuration needed.",
			},
			{
				question: "Does Google Analytics work without cookies?",
				answer:
					"No, GA4 uses first-party cookies by default. Databuddy is fully cookieless, meaning you never need a consent banner for analytics.",
			},
			{
				question: "How long does GA4 keep data?",
				answer:
					"GA4 UI caps data retention at 14 months (extendable to 25 months with configuration). Databuddy retains your data based on your plan with no arbitrary time caps.",
			},
			{
				question: "Can I use analytics without a cookie banner?",
				answer:
					"Yes, with Databuddy. Since it's fully cookieless and doesn't collect personal data, no consent banner is required under GDPR. GA4 requires consent management.",
			},
			{
				question: "Is there a free Google Analytics alternative?",
				answer:
					"Yes. Databuddy's free plan includes up to 10,000 pageviews/month with all features — AI insights, custom events, real-time analytics — with no hidden costs like BigQuery or consent platform fees.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Up to 10K",
				competitor: "Free (with sampling, 14-mo retention)",
				databuddy: "Free (all features)",
			},
			{
				pageviews: "Consent platform",
				competitor: "$10–100/mo (CookieBot, OneTrust)",
				databuddy: "Not needed",
			},
			{
				pageviews: "BigQuery export",
				competitor: "$5–50+/mo (GCP storage/queries)",
				databuddy: "Included",
			},
			{
				pageviews: "Server-side GTM",
				competitor: "$50–200+/mo (Cloud Run)",
				databuddy: "Not needed",
			},
			{
				pageviews: "Enterprise",
				competitor: "GA360: ~$50,000+/year",
				databuddy: "Contact us",
			},
		],
		migrationSection: {
			heading: "Switch from GA4 to Databuddy in under 10 minutes",
			steps: [
				"Add one async script tag (~3KB)",
				"No GTM configuration required",
				"Page views and events flow automatically — no Enhanced Measurement setup",
				"GDPR-friendly by default — you can remove your analytics consent banner",
			],
			guideHref: "/docs/getting-started",
			guideLabel: "Read the Migration Guide",
		},
	},
	plausible: {
		competitor: {
			name: "Plausible",
			slug: "plausible",
			description: "Privacy-focused web analytics",
			website: "https://plausible.io",
			tagline: "Simple and privacy-friendly Google Analytics alternative",
			color: "#5850EC",
			pricing: {
				starting: "$9/month",
				note: "For 10K monthly pageviews",
			},
		},
		hero: {
			title: "Databuddy vs Plausible",
			description:
				"Plausible shows you the numbers. Databuddy tells you what they mean. Same privacy values, dramatically more signal — with AI insights, product analytics, and a free plan.",
			cta: "Everything Plausible does, free — plus AI",
		},
		seo: {
			title: "Databuddy vs Plausible: Complete Analytics Comparison 2026",
			description:
				"Compare Databuddy and Plausible analytics. Databuddy offers AI insights, product analytics, user identification, and a free plan that Plausible doesn't have.",
		},
		features: [
			{
				name: "AI-powered insights (Databunny)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English, get instant answers",
				category: "features",
			},
			{
				name: "Product analytics (user-level)",
				databuddy: true,
				competitor: false,
				benefit: "Track user journeys, retention, and cohorts",
				category: "features",
			},
			{
				name: "User identification",
				databuddy: true,
				competitor: false,
				benefit: "Know who your users are, not just aggregate counts",
				category: "features",
			},
			{
				name: "Free plan forever",
				databuddy: true,
				competitor: false,
				benefit: "10K pageviews at $0/mo — Plausible starts at $9/mo",
				category: "pricing",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: false,
				benefit: "Roll out features gradually without extra tools",
				category: "features",
			},
			{
				name: "Custom dashboards",
				databuddy: true,
				competitor: false,
				benefit: "Build views for your workflow vs a single fixed page",
				category: "features",
			},
			{
				name: "Advanced event tracking",
				databuddy: true,
				competitor: false,
				benefit: "Rich custom events with properties and filtering",
				category: "features",
			},
			{
				name: "Raw data export",
				databuddy: true,
				competitor: false,
				benefit: "Export and integrate with your existing tools",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: true,
				benefit: "No consent banners needed, higher data accuracy",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: true,
				benefit: "Reduced legal risk and compliance costs",
				category: "privacy",
			},
			{
				name: "Open-source (AGPL-3.0)",
				databuddy: true,
				competitor: true,
				benefit: "Inspect the code, contribute, self-host",
				category: "technical",
			},
			{
				name: "Self-hosting option",
				databuddy: true,
				competitor: true,
				benefit: "Complete control over your infrastructure",
				category: "technical",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Build custom integrations and dashboards",
				category: "technical",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "Make data-driven decisions instantly",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is Plausible Analytics free?",
				answer:
					"No. Plausible starts at $9/month for 10K pageviews with a 30-day trial. Databuddy has a free forever plan with up to 10,000 pageviews/month and all features included.",
			},
			{
				question: "Does Plausible have AI analytics?",
				answer:
					"No. Plausible focuses on simple, aggregate web analytics. Databuddy includes Databunny, an AI agent that answers your analytics questions in plain English.",
			},
			{
				question: "What does Databuddy have that Plausible doesn't?",
				answer:
					"Product analytics with user-level tracking, AI-powered insights, user identification, feature flags, uptime monitoring, custom dashboards, raw data export, and a free forever plan.",
			},
			{
				question: "Is Databuddy open source?",
				answer:
					"Yes. Databuddy is AGPL-3.0 licensed — the same license Plausible uses. You can inspect the source code, self-host, and contribute.",
			},
			{
				question: "Can I switch from Plausible to Databuddy?",
				answer:
					"Yes. Add the 3KB Databuddy script to your site and start tracking immediately. No migration needed — you'll see data from the first visit.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Up to 10K",
				competitor: "$9/mo (Starter)",
				databuddy: "Free",
			},
			{
				pageviews: "Funnels",
				competitor: "$19/mo (Business plan)",
				databuddy: "Free",
			},
			{
				pageviews: "Revenue tracking",
				competitor: "$19/mo (Business plan)",
				databuddy: "Free",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Free",
			},
			{
				pageviews: "Product analytics",
				competitor: "Not available",
				databuddy: "Free",
			},
			{
				pageviews: "Feature flags",
				competitor: "Not available",
				databuddy: "Free",
			},
		],
	},
	fathom: {
		competitor: {
			name: "Fathom Analytics",
			slug: "fathom",
			description: "Simple, privacy-focused website analytics",
			website: "https://usefathom.com",
			tagline:
				"Google Analytics alternative that doesn't compromise visitor privacy",
			color: "#9187FF",
			pricing: {
				starting: "$15/month",
				note: "For 100K monthly pageviews, no free plan",
			},
		},
		hero: {
			title: "Databuddy vs Fathom Analytics",
			description:
				"Fathom is great for simple traffic stats. When you need to understand your users, you need Databuddy — product analytics, AI-powered insights, and a free plan. Same privacy values, dramatically more signal.",
			cta: "Get more for less",
		},
		seo: {
			title: "Databuddy vs Fathom Analytics: Feature & Price Comparison 2026",
			description:
				"Compare Databuddy and Fathom Analytics. See why Databuddy offers AI insights, product analytics, and a free tier for privacy-first analytics.",
		},
		features: [
			{
				name: "Databunny (NLP agent)",
				databuddy: true,
				competitor: false,
				benefit:
					'Ask "why did traffic drop last Tuesday?" in plain English — Fathom has no NLP assistant',
				category: "features",
			},
			{
				name: "Product analytics (funnels, retention, user journeys)",
				databuddy: true,
				competitor: false,
				benefit:
					"Understand what users do inside your product, not just how they found it",
				category: "features",
			},
			{
				name: "Custom dashboards",
				databuddy: true,
				competitor: false,
				benefit: "Build views for your workflow vs a single fixed page",
				category: "features",
			},
			{
				name: "Self-hosting option",
				databuddy: true,
				competitor: false,
				benefit: "Fathom commercial is cloud-only; Databuddy is open-source",
				category: "technical",
			},
			{
				name: "Funnels & goals",
				databuddy: true,
				competitor: false,
				benefit: "Track conversion paths — Fathom has no funnel builder",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit:
					"Know when your site goes down without a separate tool — Fathom removed uptime monitoring in Oct 2023",
				category: "features",
			},
			{
				name: "Free tier included",
				databuddy: true,
				competitor: false,
				benefit: "10K pageviews at $0/mo — Fathom minimum is $15/mo",
				category: "pricing",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: true,
				benefit: "No consent banners needed, higher data accuracy",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: true,
				benefit: "Reduced legal risk and compliance costs",
				category: "privacy",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both process data instantly for live dashboards",
				category: "features",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Both track custom events — Databuddy adds richer properties",
				category: "features",
			},
			{
				name: "Data export",
				databuddy: true,
				competitor: true,
				benefit: "Both offer CSV export — Databuddy adds raw data API access",
				category: "features",
			},
			{
				name: "Data ownership",
				databuddy: true,
				competitor: true,
				benefit: "Both let you own your data — Databuddy adds self-hosting",
				category: "privacy",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Both offer full REST APIs on all plans",
				category: "technical",
			},
			{
				name: "Team collaboration",
				databuddy: true,
				competitor: true,
				benefit: "Share insights across your organization",
				category: "features",
			},
			{
				name: "Multiple domains",
				databuddy: true,
				competitor: true,
				benefit: "Manage multiple websites from one dashboard",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Does Fathom Analytics have AI?",
				answer:
					"No. Fathom focuses on simple, aggregate web analytics. Databuddy includes Databunny, an AI agent that answers analytics questions in plain English.",
			},
			{
				question: "Can Fathom track product funnels?",
				answer:
					"No. Fathom doesn't have a built-in funnel builder. Databuddy includes funnels and goals tracking on the free plan.",
			},
			{
				question: "Is Fathom cheaper than Databuddy?",
				answer:
					"No. Fathom starts at $15/month with no free plan. Databuddy is free for up to 10,000 pageviews/month with all features included.",
			},
			{
				question: "Can I self-host Fathom Analytics?",
				answer:
					"Fathom Lite (the old open-source version) can be self-hosted, but the commercial product is cloud-only. Databuddy is fully open-source (AGPL-3.0) and self-hostable.",
			},
			{
				question: "What does Databuddy have that Fathom doesn't?",
				answer:
					"AI-powered insights, product analytics, custom dashboards, funnels and goals, self-hosting, uptime monitoring, and a free forever plan.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Up to 10K",
				competitor: "$15/mo",
				databuddy: "Free",
			},
			{
				pageviews: "100K",
				competitor: "$15/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "200K",
				competitor: "$25/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "500K",
				competitor: "$45/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "1M",
				competitor: "$60/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "2M",
				competitor: "$100/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "5M",
				competitor: "$140/mo",
				databuddy: "Paid plan",
			},
		],
	},
	posthog: {
		competitor: {
			name: "PostHog",
			slug: "posthog",
			description: "Open-source product analytics suite",
			website: "https://posthog.com",
			tagline:
				"All-in-one product analytics, session replay, and feature flags",
			color: "#F54E00",
			pricing: {
				starting: "Free",
				note: "Pay-as-you-go, costs scale fast",
			},
		},
		hero: {
			title: "Databuddy vs PostHog",
			description:
				"PostHog is 10+ products. You're probably only using 2. Databuddy gives you what matters — analytics and AI insights — at 1/17th the script size.",
			cta: "Lighter, faster, AI-native analytics",
		},
		seo: {
			title: "Databuddy vs PostHog: Lightweight Analytics Alternative 2026",
			description:
				"Compare Databuddy and PostHog. See why teams are choosing lighter, AI-native analytics over PostHog's heavyweight platform.",
		},
		features: [
			{
				name: "AI insights (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English, get instant answers",
				category: "features",
			},
			{
				name: "Lightweight script (3KB)",
				databuddy: true,
				competitor: false,
				benefit: "3KB vs 52KB+ — better Core Web Vitals",
				category: "performance",
			},
			{
				name: "Cookie-free by default",
				databuddy: true,
				competitor: false,
				benefit: "PostHog uses cookies by default, requires config to disable",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: false,
				benefit: "No EU cloud config or self-hosting required for compliance",
				category: "privacy",
			},
			{
				name: "Simple setup",
				databuddy: true,
				competitor: false,
				benefit: "One script tag vs ClickHouse + Kafka + Redis + PostgreSQL",
				category: "technical",
			},
			{
				name: "Transparent pricing",
				databuddy: true,
				competitor: false,
				benefit: "Free tier + simple paid plans vs complex pay-as-you-go",
				category: "pricing",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "Web + product analytics",
				databuddy: true,
				competitor: true,
				benefit: "Unified analytics for traffic and product usage",
				category: "features",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit: "Roll out features gradually",
				category: "features",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Track custom user interactions and conversions",
				category: "features",
			},
			{
				name: "Open-source",
				databuddy: true,
				competitor: true,
				benefit: "Inspect the code, contribute, self-host",
				category: "technical",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Build custom integrations and dashboards",
				category: "technical",
			},
			{
				name: "Session replay",
				databuddy: false,
				competitor: true,
				benefit: "PostHog includes session replay — Databuddy doesn't",
				category: "features",
			},
			{
				name: "A/B testing",
				databuddy: false,
				competitor: true,
				benefit: "PostHog includes experiments — Databuddy doesn't yet",
				category: "features",
			},
			{
				name: "Surveys",
				databuddy: false,
				competitor: true,
				benefit: "PostHog includes in-app surveys — Databuddy doesn't",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is PostHog free?",
				answer:
					"PostHog has a free tier, but costs scale quickly with usage. The median annual contract is ~$54,000/year according to Vendr data. Databuddy's free plan includes 10K pageviews with all features.",
			},
			{
				question: "Is PostHog overkill for most teams?",
				answer:
					"Often, yes. PostHog bundles 10+ products (analytics, session replay, A/B testing, surveys, data warehouse, etc.), but most teams only use 2-3. The 52KB+ script slows your site even for features you don't use.",
			},
			{
				question: "How does Databuddy compare to PostHog's self-hosting?",
				answer:
					"PostHog self-hosting requires ClickHouse, Kafka, Redis, and PostgreSQL — a complex infrastructure stack. Databuddy is significantly simpler to self-host.",
			},
			{
				question: "Does Databuddy have session replay?",
				answer:
					"Not yet. If session replay is critical for your workflow, PostHog is the better choice. Databuddy focuses on analytics, AI insights, and product analytics.",
			},
			{
				question: "Why choose Databuddy over PostHog?",
				answer:
					"If you need fast, lightweight, privacy-first analytics with AI insights and don't need session replay or A/B testing, Databuddy is the leaner choice — 3KB script vs 52KB+, simpler pricing, and GDPR compliant by default.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Free tier",
				competitor: "1M events/mo (then $0.00031/event)",
				databuddy: "10K pageviews/mo (all features)",
			},
			{
				pageviews: "Session replay",
				competitor: "5K free, then $0.005/recording",
				databuddy: "Not available",
			},
			{
				pageviews: "Feature flags",
				competitor: "1M free, then $0.0001/request",
				databuddy: "Included",
			},
			{
				pageviews: "Typical annual cost",
				competitor: "~$54,000/year (Vendr median)",
				databuddy: "Free or paid plans",
			},
		],
	},
	umami: {
		competitor: {
			name: "Umami",
			slug: "umami",
			description: "Simple, fast, privacy-focused web analytics",
			website: "https://umami.is",
			tagline: "Open-source, privacy-focused alternative to Google Analytics",
			color: "#000000",
			pricing: {
				starting: "Free (self-hosted)",
				note: "Cloud: free for 10K events, then $9/mo",
			},
		},
		hero: {
			title: "Databuddy vs Umami",
			description:
				"Same privacy values, dramatically more signal. Umami shows numbers — Databuddy shows what they mean with AI insights, product analytics, and user identification.",
			cta: "Beyond basic analytics",
		},
		seo: {
			title: "Databuddy vs Umami: Analytics Comparison 2026",
			description:
				"Compare Databuddy and Umami analytics. Both are open-source and privacy-first. Databuddy adds AI insights, product analytics, and user identification.",
		},
		features: [
			{
				name: "AI insights (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English, get instant answers",
				category: "features",
			},
			{
				name: "Product analytics (user-level)",
				databuddy: true,
				competitor: false,
				benefit: "Track user journeys, retention, and cohorts",
				category: "features",
			},
			{
				name: "User identification",
				databuddy: true,
				competitor: false,
				benefit: "Know who your users are — Umami only does anonymous hashing",
				category: "features",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: false,
				benefit: "Roll out features gradually without extra tools",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "AI email reports",
				databuddy: true,
				competitor: false,
				benefit: "Auto-generated insights delivered to your inbox",
				category: "features",
			},
			{
				name: "Custom dashboards",
				databuddy: true,
				competitor: false,
				benefit: "Build views tailored to your workflow",
				category: "features",
			},
			{
				name: "Funnels & goals",
				databuddy: true,
				competitor: false,
				benefit: "Track conversion paths and key metrics",
				category: "features",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: true,
				benefit: "No consent banners needed",
				category: "privacy",
			},
			{
				name: "GDPR compliant",
				databuddy: true,
				competitor: true,
				benefit: "Privacy-first by design",
				category: "privacy",
			},
			{
				name: "Open-source",
				databuddy: true,
				competitor: true,
				benefit: "Databuddy: AGPL-3.0 / Umami: MIT",
				category: "technical",
			},
			{
				name: "Self-hosting option",
				databuddy: true,
				competitor: true,
				benefit: "Complete control over your infrastructure",
				category: "technical",
			},
			{
				name: "Custom events",
				databuddy: true,
				competitor: true,
				benefit: "Track user interactions beyond pageviews",
				category: "features",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "See live visitor activity",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is Umami free?",
				answer:
					"Umami is free to self-host (MIT license). Umami Cloud offers 10K events free, then starts at $9/month. Databuddy's free plan includes 10K pageviews with all features including AI insights.",
			},
			{
				question: "What does Databuddy have that Umami doesn't?",
				answer:
					"AI-powered insights (Databunny), product analytics with user-level tracking, user identification, feature flags, uptime monitoring, custom dashboards, funnels, and AI-generated email reports.",
			},
			{
				question: "Can Umami identify individual users?",
				answer:
					"No. Umami uses anonymous hashing and doesn't support user identification by design. Databuddy supports user identification for product analytics use cases.",
			},
			{
				question: "Which is better for developers?",
				answer:
					"Both are developer-friendly. If you just need basic pageview analytics, Umami is great. If you want AI insights, product analytics, and feature flags alongside web analytics, Databuddy is the better fit.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Self-hosted",
				competitor: "Free (MIT)",
				databuddy: "Free (AGPL-3.0)",
			},
			{
				pageviews: "Cloud (10K events)",
				competitor: "Free",
				databuddy: "Free (all features)",
			},
			{
				pageviews: "Cloud (100K events)",
				competitor: "$9/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Included",
			},
			{
				pageviews: "Product analytics",
				competitor: "Not available",
				databuddy: "Included",
			},
		],
	},
	mixpanel: {
		competitor: {
			name: "Mixpanel",
			slug: "mixpanel",
			description: "Product analytics for product-led growth",
			website: "https://mixpanel.com",
			tagline: "One of the original product analytics platforms",
			color: "#7856FF",
			pricing: {
				starting: "Free",
				note: "Limited free tier, Growth ~$24/mo+, scales steeply",
			},
		},
		hero: {
			title: "Databuddy vs Mixpanel",
			description:
				"Mixpanel needs a data team to set up and maintain. Databunny IS your data team — AI-native analytics that answers your questions without complex instrumentation.",
			cta: "Product analytics without the complexity",
		},
		seo: {
			title: "Databuddy vs Mixpanel: Simpler Product Analytics 2026",
			description:
				"Compare Databuddy and Mixpanel. Databuddy unifies web and product analytics with AI insights, simpler setup, and a free plan — no data team required.",
		},
		features: [
			{
				name: "AI agent (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English vs manual report building",
				category: "features",
			},
			{
				name: "Web + product analytics unified",
				databuddy: true,
				competitor: false,
				benefit: "Mixpanel is product-only — no web traffic analytics",
				category: "features",
			},
			{
				name: "Simple setup",
				databuddy: true,
				competitor: false,
				benefit: "One script tag vs complex event taxonomy design",
				category: "technical",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: false,
				benefit: "Mixpanel uses cookies and device IDs by default",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: false,
				benefit: "No configuration needed — Mixpanel collects PII by default",
				category: "privacy",
			},
			{
				name: "Data ownership (self-hostable)",
				databuddy: true,
				competitor: false,
				benefit: "Mixpanel is cloud-only; Databuddy is open-source",
				category: "privacy",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: false,
				benefit: "Roll out features gradually without extra tools",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "Funnels & retention",
				databuddy: true,
				competitor: true,
				benefit: "Both track conversion paths — Mixpanel's is more mature",
				category: "features",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Both track custom events with properties",
				category: "features",
			},
			{
				name: "User identification",
				databuddy: true,
				competitor: true,
				benefit: "Both identify users — Databuddy does it privacy-first",
				category: "features",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Build custom integrations and dashboards",
				category: "technical",
			},
			{
				name: "Behavioral cohorts",
				databuddy: false,
				competitor: true,
				benefit:
					"Mixpanel has deep cohort analysis — Databuddy uses AI instead",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is Mixpanel free?",
				answer:
					"Mixpanel has a limited free tier (20M events/month) but critical features like group analytics and data pipelines require paid plans starting at ~$24/month. Databuddy's free plan includes 10K pageviews with all features.",
			},
			{
				question: "Do I need a data team for Mixpanel?",
				answer:
					"Effectively, yes. Mixpanel requires careful event taxonomy design, SDK instrumentation, and ongoing maintenance to get value. Databuddy's AI agent (Databunny) handles the analysis for you.",
			},
			{
				question: "Does Mixpanel have web analytics?",
				answer:
					"No. Mixpanel is product analytics only — it doesn't track web traffic, pageviews, or referrers. Databuddy unifies web and product analytics in one platform.",
			},
			{
				question: "Is Mixpanel GDPR compliant?",
				answer:
					"Mixpanel requires configuration for GDPR compliance and collects PII by default. Databuddy is GDPR compliant out of the box — cookieless, no personal data collection.",
			},
			{
				question: "Can I switch from Mixpanel to Databuddy?",
				answer:
					"Yes. Add the Databuddy script and start tracking immediately. For product analytics, you'll get AI-powered insights without the complex event instrumentation Mixpanel requires.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Free tier",
				competitor: "20M events (limited features)",
				databuddy: "10K pageviews (all features)",
			},
			{
				pageviews: "Growth plan",
				competitor: "~$24/mo+",
				databuddy: "Paid plan",
			},
			{
				pageviews: "Group analytics",
				competitor: "Enterprise plan only",
				databuddy: "Included",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Included",
			},
			{
				pageviews: "Web analytics",
				competitor: "Not available",
				databuddy: "Included",
			},
		],
	},
	amplitude: {
		competitor: {
			name: "Amplitude",
			slug: "amplitude",
			description: "Enterprise behavioral analytics platform",
			website: "https://amplitude.com",
			tagline: "The enterprise standard for behavioral analytics",
			color: "#1E61F0",
			pricing: {
				starting: "Free",
				note: "Plus: $49/mo, Growth & Enterprise: custom pricing",
			},
		},
		hero: {
			title: "Databuddy vs Amplitude",
			description:
				"Amplitude is built for companies with analysts. Databuddy is built for founders without one. Same behavioral insights, powered by AI, at a fraction of the cost.",
			cta: "Enterprise insights without the enterprise price",
		},
		seo: {
			title: "Databuddy vs Amplitude: Analytics for Startups 2026",
			description:
				"Compare Databuddy and Amplitude. Databuddy offers AI-native product analytics for startups — simpler setup, transparent pricing, and no data team required.",
		},
		features: [
			{
				name: "AI agent (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English vs complex report builders",
				category: "features",
			},
			{
				name: "Simple setup",
				databuddy: true,
				competitor: false,
				benefit:
					"One script tag vs heavy SDK instrumentation and taxonomy planning",
				category: "technical",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: false,
				benefit: "Amplitude uses cookies by default",
				category: "privacy",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: false,
				benefit: "No configuration needed — Amplitude requires setup",
				category: "privacy",
			},
			{
				name: "Self-hosting (AGPL-3.0)",
				databuddy: true,
				competitor: false,
				benefit: "Amplitude is cloud-only; Databuddy is open-source",
				category: "technical",
			},
			{
				name: "Transparent pricing",
				databuddy: true,
				competitor: false,
				benefit: "Free + simple paid plans vs custom enterprise quotes",
				category: "pricing",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "Web + product analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both track product usage — Databuddy adds web traffic",
				category: "features",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: true,
				benefit: "Both offer feature flags (Amplitude Experiment)",
				category: "features",
			},
			{
				name: "Retention analysis",
				databuddy: true,
				competitor: true,
				benefit: "Both track retention — Amplitude's is best-in-class",
				category: "features",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Both track custom events with properties",
				category: "features",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Build custom integrations and dashboards",
				category: "technical",
			},
			{
				name: "Behavioral cohorts",
				databuddy: false,
				competitor: true,
				benefit:
					"Amplitude has deep cohort analysis — Databuddy uses AI instead",
				category: "features",
			},
			{
				name: "Session replay",
				databuddy: false,
				competitor: true,
				benefit: "Amplitude includes session replay — Databuddy doesn't yet",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is Amplitude free?",
				answer:
					"Amplitude has a free Starter plan with limited features and 50K MTUs. The Plus plan starts at $49/month, and Growth/Enterprise require custom pricing. Databuddy is free for up to 10K pageviews with all features.",
			},
			{
				question: "Do I need a data team for Amplitude?",
				answer:
					"Most teams that get real value from Amplitude have dedicated analysts or data engineers. Databuddy's AI agent (Databunny) replaces that need — ask questions in plain English, get instant answers.",
			},
			{
				question: "Is Amplitude overkill for startups?",
				answer:
					"Often, yes. Amplitude's strength is enterprise-grade behavioral analytics with deep segmentation. If you're a small team that just wants to understand users without a month of instrumentation work, Databuddy is the lighter choice.",
			},
			{
				question: "How does pricing compare at scale?",
				answer:
					"Amplitude's pricing is opaque at scale — Growth and Enterprise plans require sales calls. Databuddy has transparent pricing with a free tier and simple paid plans.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Free tier",
				competitor: "Starter (limited, 50K MTUs)",
				databuddy: "Free (all features, 10K pageviews)",
			},
			{
				pageviews: "Paid plan",
				competitor: "Plus: $49/mo",
				databuddy: "Paid plan",
			},
			{
				pageviews: "Enterprise",
				competitor: "Custom pricing (sales call)",
				databuddy: "Contact us",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Included",
			},
			{
				pageviews: "Web analytics",
				competitor: "Secondary focus",
				databuddy: "Included",
			},
		],
	},
	rybbit: {
		competitor: {
			name: "Rybbit",
			slug: "rybbit",
			description: "Modern, open-source web analytics",
			website: "https://rybbit.io",
			tagline: "Open-source, cookieless web analytics",
			color: "#0a3a3a",
			pricing: {
				starting: "Free (self-hosted)",
				note: "Cloud pricing TBD",
			},
		},
		hero: {
			title: "Databuddy vs Rybbit",
			description:
				"We share the same values on privacy. We disagree on whether AI should help you understand your data. Same cookieless analytics, opposite bets on insights.",
			cta: "Analytics that tells you what your data means",
		},
		seo: {
			title: "Databuddy vs Rybbit: Analytics Comparison 2026",
			description:
				"Compare Databuddy and Rybbit analytics. Both are open-source and privacy-first. Databuddy adds AI insights, product analytics, and user identification.",
		},
		features: [
			{
				name: "AI agent (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English, get instant answers",
				category: "features",
			},
			{
				name: "Product analytics (user-level)",
				databuddy: true,
				competitor: false,
				benefit: "Track user journeys and retention — Rybbit is web-only",
				category: "features",
			},
			{
				name: "User identification",
				databuddy: true,
				competitor: false,
				benefit: "Know who your users are — Rybbit is anonymous only",
				category: "features",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: false,
				benefit: "Roll out features gradually without extra tools",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "AI email reports",
				databuddy: true,
				competitor: false,
				benefit: "Auto-generated insights delivered to your inbox",
				category: "features",
			},
			{
				name: "Managed cloud (free tier)",
				databuddy: true,
				competitor: false,
				benefit: "Free hosted plan — Rybbit cloud is early/limited",
				category: "pricing",
			},
			{
				name: "Lightweight script",
				databuddy: true,
				competitor: true,
				benefit: "Databuddy: 3KB / Rybbit: ~9KB — both fast",
				category: "performance",
			},
			{
				name: "Cookie-free tracking",
				databuddy: true,
				competitor: true,
				benefit: "No consent banners needed",
				category: "privacy",
			},
			{
				name: "GDPR compliant",
				databuddy: true,
				competitor: true,
				benefit: "Privacy-first by design",
				category: "privacy",
			},
			{
				name: "Open-source (AGPL-3.0)",
				databuddy: true,
				competitor: true,
				benefit: "Both fully open-source under AGPL-3.0",
				category: "technical",
			},
			{
				name: "Self-hosting option",
				databuddy: true,
				competitor: true,
				benefit: "Complete control over your infrastructure",
				category: "technical",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "See live visitor activity",
				category: "features",
			},
		],
		faqs: [
			{
				question: "What's the difference between Databuddy and Rybbit?",
				answer:
					"Both are open-source, cookieless, and privacy-first. The core difference: Rybbit focuses on basic web analytics without AI. Databuddy adds an AI agent (Databunny), product analytics, user identification, feature flags, and uptime monitoring.",
			},
			{
				question: "Does Rybbit have AI analytics?",
				answer:
					"No. Rybbit's founder has publicly stated that NLP-powered analytics insights are unnecessary. Databuddy's users disagree — Databunny is one of the most requested features.",
			},
			{
				question: "Is Rybbit free?",
				answer:
					"Rybbit is free to self-host. Their managed cloud is still early. Databuddy offers both a free managed cloud plan (10K pageviews) and self-hosting.",
			},
			{
				question: "Which has better privacy?",
				answer:
					"Both are excellent on privacy — cookieless, GDPR compliant, open-source. Neither collects personal data. The choice comes down to whether you want AI insights and product analytics.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Self-hosted",
				competitor: "Free (AGPL-3.0)",
				databuddy: "Free (AGPL-3.0)",
			},
			{
				pageviews: "Managed cloud",
				competitor: "Early / limited",
				databuddy: "Free (10K pageviews)",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Included",
			},
			{
				pageviews: "Product analytics",
				competitor: "Not available",
				databuddy: "Included",
			},
		],
	},
	matomo: {
		competitor: {
			name: "Matomo",
			slug: "matomo",
			description: "Self-hosted web analytics since 2007",
			website: "https://matomo.org",
			tagline: "The leading open-source analytics platform since 2007",
			color: "#3152A0",
			pricing: {
				starting: "Free (self-hosted)",
				note: "Cloud: ~€19/mo, premium plugins extra",
			},
		},
		hero: {
			title: "Databuddy vs Matomo",
			description:
				"Matomo has been the privacy-first standard since 2007, and the UX shows. Databuddy was built for how modern startup teams actually work — with AI insights out of the box.",
			cta: "Modern analytics, same privacy values",
		},
		seo: {
			title: "Databuddy vs Matomo: Modern Analytics Alternative 2026",
			description:
				"Compare Databuddy and Matomo. Both are open-source and privacy-first. Databuddy offers a modern UI, AI insights, and simpler self-hosting without the PHP stack.",
		},
		features: [
			{
				name: "AI agent (Databunny NLP)",
				databuddy: true,
				competitor: false,
				benefit: "Ask questions in plain English, get instant answers",
				category: "features",
			},
			{
				name: "Modern UI / UX",
				databuddy: true,
				competitor: false,
				benefit: "Clean, real-time dashboard vs Matomo's legacy interface",
				category: "features",
			},
			{
				name: "Lightweight script (3KB)",
				databuddy: true,
				competitor: false,
				benefit: "3KB async vs Matomo's heavier PHP-generated tracking",
				category: "performance",
			},
			{
				name: "Simple self-hosting",
				databuddy: true,
				competitor: false,
				benefit: "Modern stack vs PHP + MySQL + cron job configuration",
				category: "technical",
			},
			{
				name: "Cookie-free by default",
				databuddy: true,
				competitor: false,
				benefit: "Matomo uses cookies by default (configurable)",
				category: "privacy",
			},
			{
				name: "Feature flags",
				databuddy: true,
				competitor: false,
				benefit: "Roll out features gradually — Matomo doesn't have this",
				category: "features",
			},
			{
				name: "Uptime monitoring",
				databuddy: true,
				competitor: false,
				benefit: "Know when your site goes down — no extra tool needed",
				category: "features",
			},
			{
				name: "GDPR compliant by default",
				databuddy: true,
				competitor: true,
				benefit: "Both have strong GDPR positioning",
				category: "privacy",
			},
			{
				name: "Self-hosting option",
				databuddy: true,
				competitor: true,
				benefit: "Both are open-source and self-hostable",
				category: "technical",
			},
			{
				name: "Event tracking",
				databuddy: true,
				competitor: true,
				benefit: "Both track custom events and goals",
				category: "features",
			},
			{
				name: "Real-time analytics",
				databuddy: true,
				competitor: true,
				benefit: "Both offer real-time visitor tracking",
				category: "features",
			},
			{
				name: "API access",
				databuddy: true,
				competitor: true,
				benefit: "Both offer comprehensive APIs",
				category: "technical",
			},
			{
				name: "Heatmaps",
				databuddy: false,
				competitor: true,
				benefit: "Matomo offers heatmaps as a premium plugin",
				category: "features",
			},
			{
				name: "Session recordings",
				databuddy: false,
				competitor: true,
				benefit: "Matomo offers session recordings as a premium plugin",
				category: "features",
			},
			{
				name: "A/B testing",
				databuddy: false,
				competitor: true,
				benefit: "Matomo offers A/B testing as a premium plugin",
				category: "features",
			},
		],
		faqs: [
			{
				question: "Is Matomo free?",
				answer:
					"Matomo On-Premise is free to self-host, but requires PHP, MySQL, and server maintenance. Matomo Cloud starts at ~€19/month. Premium plugins (heatmaps, session recordings, A/B testing) cost extra. Databuddy is free for up to 10K pageviews with all features.",
			},
			{
				question: "Is Matomo's UI outdated?",
				answer:
					"Matomo has been around since 2007 (originally Piwik) and its interface reflects that legacy. Databuddy was built from scratch for modern teams with a clean, real-time dashboard and AI-powered insights.",
			},
			{
				question: "Is Matomo hard to self-host?",
				answer:
					"Matomo requires PHP, MySQL, and cron job configuration — a traditional LAMP stack. Databuddy uses a modern stack that's simpler to deploy and maintain.",
			},
			{
				question: "Does Matomo have AI analytics?",
				answer:
					"No. Matomo focuses on traditional report-based analytics. Databuddy includes Databunny, an AI agent that answers your questions in plain English.",
			},
			{
				question: "What does Matomo have that Databuddy doesn't?",
				answer:
					"Matomo offers heatmaps, session recordings, and A/B testing as premium plugins. It also has a larger plugin ecosystem and 18+ years of community development. Databuddy focuses on AI-native analytics with a modern UX.",
			},
		],
		pricingTiers: [
			{
				pageviews: "Self-hosted",
				competitor: "Free (PHP + MySQL required)",
				databuddy: "Free (modern stack)",
			},
			{
				pageviews: "Cloud hosting",
				competitor: "~€19/mo",
				databuddy: "Free (10K pageviews)",
			},
			{
				pageviews: "Heatmaps plugin",
				competitor: "€199/year",
				databuddy: "Not available",
			},
			{
				pageviews: "Session recordings",
				competitor: "€199/year",
				databuddy: "Not available",
			},
			{
				pageviews: "AI insights",
				competitor: "Not available",
				databuddy: "Included",
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

import { SITE_URL } from "@/app/util/constants";

export const homePageSeo = {
	title: "Lightweight Analytics for Developers - One Connected Platform",
	description:
		"Cookieless analytics, errors, web vitals, feature flags, and AI analysis in one dashboard. Open source, with 10,000 monthly events free.",
	url: SITE_URL,
} as const;

export interface LandingFaqItem {
	answer: string;
	question: string;
}

export const homeFaqItems: LandingFaqItem[] = [
	{
		question: "What does the Databuddy platform include?",
		answer:
			"Databuddy connects analytics, error tracking, web vitals monitoring, feature flags, short links, and AI analysis in one platform. A lightweight browser script collects analytics data; the other capabilities are managed from the same dashboard.",
	},
	{
		question: "How is Databuddy different from Google Analytics?",
		answer:
			"Databuddy combines cookieless analytics with errors, Core Web Vitals, funnels, feature flags, and AI analysis. It is open source and can be self-hosted. Google Analytics offers its own reporting and advertising integrations.",
	},
	{
		question: "Do I need cookie consent banners?",
		answer:
			"The analytics tracker uses browser storage instead of cookies. Consent requirements depend on your configuration, the information you collect, and applicable rules. Cookieless does not automatically mean consent-free.",
	},
	{
		question: "What is included in the free plan?",
		answer:
			"The free plan includes 10,000 monthly events, real-time analytics, Core Web Vitals, one funnel, two goals, and up to three feature flags. Error tracking starts on Hobby. No credit card is required.",
	},
	{
		question: "How long does setup take?",
		answer:
			"Add the script tag or install the SDK for your framework, then verify your first visit in the dashboard. Custom events and user identification are optional setup steps.",
	},
	{
		question: "Can I migrate from Google Analytics, PostHog, or Plausible?",
		answer:
			"Yes. Add Databuddy alongside your current tool, compare the data for as long as you need, and remove the old script when you're satisfied.",
	},
	{
		question: "What happens if I outgrow the free plan?",
		answer:
			"The dashboard can warn you as usage approaches your allowance. Free-plan ingestion pauses after 10,000 monthly events. Hobby and Pro can continue with tiered event overage unless you set a hard billing limit.",
	},
	{
		question: "Will the script slow down my site?",
		answer:
			"The tracker is about 13 KB gzipped and loads asynchronously. Real impact depends on your site and setup, so measure it in your own performance budget.",
	},
	{
		question: "Why pay when I can self-host for free?",
		answer:
			"Self-hosting is a real option, not a downgrade. The whole stack is open source and runs on your own infrastructure at no cost. The paid plans exist for teams who would rather not operate ClickHouse, Postgres, and Redis themselves.",
	},
	{
		question: "Can I trust the AI answers?",
		answer:
			"Databunny and investigations query your own analytics data, and every answer carries the evidence behind it. Investigations save the queries, findings, and recommendation so you can check the reasoning instead of trusting a summary.",
	},
	{
		question: "Do you sell my data?",
		answer:
			"No. Databuddy is open source and can run on your own infrastructure or our managed cloud. Hosting, billing, AI, and delivery providers process information needed to operate the features you use; see our Data Policy.",
	},
];

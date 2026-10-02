import { SITE_URL } from "@/app/util/constants";

export const homePageSeo = {
	title: "Cookieless Product Analytics for Startups | Databuddy",
	description:
		"Track visitors, events, funnels, and goals with one cookieless 13 KB script. Ask Databunny, the built-in AI analyst, about your numbers. Free up to 10k events.",
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
			"Product analytics from one cookieless script: visitors, custom events, funnels, goals, and user profiles, with error tracking and web vitals when you turn them on. Uptime monitoring, feature flags, short links, and Databunny, the built-in AI analyst, run in the same dashboard.",
	},
	{
		question: "How is Databuddy different from Google Analytics?",
		answer:
			"Databuddy combines cookieless analytics with errors, Core Web Vitals, funnels, feature flags, and AI analysis. The code is open source on GitHub. Google Analytics offers its own reporting and advertising integrations.",
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
		question: "Can I self-host Databuddy?",
		answer:
			"The code is open source on GitHub, but a packaged self-host release is still pending. Until it ships, use the managed cloud, which is free up to 10,000 events a month.",
	},
	{
		question: "Can I trust the AI answers?",
		answer:
			"Databunny queries your own analytics data, and chat shows the query behind each answer. Investigations on Business and Scale save the queries, findings, and next step so you can check the reasoning instead of trusting a summary.",
	},
	{
		question: "Do you sell my data?",
		answer:
			"No. Databuddy is open source and runs on our managed cloud. Hosting, billing, AI, and delivery providers process information needed to operate the features you use; see our Data Policy.",
	},
];

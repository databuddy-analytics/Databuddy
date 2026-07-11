import { SITE_URL } from "@/app/util/constants";

export const homePageSeo = {
	title: "Lightweight Analytics for Developers - One Connected Platform",
	description:
		"Analytics, error tracking, web vitals, feature flags, and automatic findings in one connected platform. No cookies, GDPR compliant. Free for small projects. Open-source Google Analytics alternative for developers.",
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
			"Databuddy uses a lightweight asynchronous tracker, uses no cookies, and is GDPR compliant by default. It also connects error tracking, Core Web Vitals monitoring, funnels, and feature flags in the same platform.",
	},
	{
		question: "Do I need cookie consent banners?",
		answer:
			"No. Databuddy uses no cookies and does not track individual users. You can remove consent banners entirely and remain compliant with GDPR, CCPA, and ePrivacy regulations.",
	},
	{
		question: "What is included in the free plan?",
		answer:
			"The free plan includes 10,000 monthly events, real-time analytics, Core Web Vitals, one funnel, two goals, and up to three feature flags. Error tracking starts on Hobby. No credit card is required.",
	},
	{
		question: "How long does setup take?",
		answer:
			"Under 5 minutes. Add one script tag to your HTML, or install our SDK for Next.js, React, Vue, or vanilla JS. Data appears in your dashboard immediately after the first page load.",
	},
	{
		question: "Can I migrate from Google Analytics, PostHog, or Plausible?",
		answer:
			"Yes. Add Databuddy alongside your current tool, compare the data for as long as you need, and remove the old script when you are satisfied with the results.",
	},
	{
		question: "What happens if I outgrow the free plan?",
		answer:
			"The dashboard can warn you as usage approaches your allowance. Free-plan ingestion pauses after 10,000 monthly events. Hobby and Pro can continue with tiered event overage unless you set a hard billing limit.",
	},
	{
		question: "Will the script slow down my site?",
		answer:
			"The tracker is about 10 KB gzipped and loads asynchronously. Its effect depends on your site and configuration, so measure it in your own performance budget instead of assuming any script has zero impact.",
	},
	{
		question: "Is my data safe? Can I self-host?",
		answer:
			"Databuddy is open source. You can self-host on your own infrastructure for full data sovereignty, or use our managed cloud where data is encrypted at rest and in transit. We never sell or share your data.",
	},
];

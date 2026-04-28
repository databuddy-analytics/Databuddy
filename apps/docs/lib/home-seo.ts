import { SITE_URL } from "@/app/util/constants";

export const homePageSeo = {
	title:
		"AI-Native Analytics - Ask Questions, Get Answers, Not Dashboards",
	description:
		"Ask your data anything in plain English. AI agent, error tracking, web vitals, and feature flags in one script under 30 KB. No cookies, GDPR compliant. Open-source Google Analytics alternative.",
	url: SITE_URL,
} as const;

export interface LandingFaqItem {
	answer: string;
	question: string;
}

export const homeFaqItems: LandingFaqItem[] = [
	{
		question: "What do you mean by one layer?",
		answer:
			"Most teams pay for separate analytics, error tracking, feature flag, and performance monitoring tools. Databuddy combines all four into one connected system - one script, one dashboard, one bill. You see the full picture without switching tabs.",
	},
	{
		question: "How is Databuddy different from Google Analytics?",
		answer:
			"Databuddy loads a single script under 30 KB (GA4 is 45 KB+), uses no cookies, and is GDPR compliant by default. It also includes error tracking, Core Web Vitals monitoring, funnels, and feature flags - capabilities that require separate tools with GA.",
	},
	{
		question: "Do I need cookie consent banners?",
		answer:
			"No. Databuddy uses no cookies and does not track individual users. You can remove consent banners entirely and remain compliant with GDPR, CCPA, and ePrivacy regulations.",
	},
	{
		question: "What is included in the free plan?",
		answer:
			"The free plan includes up to 10,000 monthly events, real-time analytics, error tracking, Core Web Vitals, and basic feature flags. No credit card required. Enough for most side projects and small sites.",
	},
	{
		question: "How long does setup take?",
		answer:
			"Under 5 minutes. Add one script tag to your HTML, or install our SDK for Next.js, React, Vue, or vanilla JS. Data appears in your dashboard immediately after the first page load.",
	},
	{
		question: "Can I migrate from Google Analytics, PostHog, or Plausible?",
		answer:
			"Yes. You don't need to rip anything out. Add Databuddy alongside your current tool, compare data for as long as you need, and remove the old script when you're ready. Most teams switch fully within a week.",
	},
	{
		question: "What happens if I outgrow the free plan?",
		answer:
			"You get a heads-up before you hit any limit. Upgrading takes one click, and your data is never lost or paused. Overage pricing is tiered - the more you use, the cheaper each event gets.",
	},
	{
		question: "Will the script slow down my site?",
		answer:
			"No. The tracking script is under 3 KB gzipped and loads asynchronously. It has zero impact on your Core Web Vitals. For comparison, Google Analytics is 45 KB+ and blocks rendering.",
	},
	{
		question: "Is my data safe? Can I self-host?",
		answer:
			"Databuddy is open source. You can self-host on your own infrastructure for full data sovereignty, or use our managed cloud where data is encrypted at rest and in transit. We never sell or share your data.",
	},
];

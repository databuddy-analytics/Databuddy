import { SITE_URL } from "@/app/util/constants";

export const homePageSeo = {
	title:
		"Privacy-First Web Analytics — Under 30 KB, No Cookies, GDPR Compliant",
	description:
		"One lightweight layer for analytics, error tracking, and feature flags. Under 30 KB script, zero cookies, full GDPR compliance. Set up in 5 minutes. Open-source Google Analytics alternative that stays simple.",
	url: SITE_URL,
} as const;

export interface LandingFaqItem {
	question: string;
	answer: string;
}

export const homeFaqItems: LandingFaqItem[] = [
	{
		question: "What do you mean by one layer?",
		answer:
			"Most teams pay for separate analytics, error tracking, feature flag, and performance monitoring tools. Databuddy combines all four into one connected system — one script, one dashboard, one bill. You see the full picture without switching tabs.",
	},
	{
		question: "How is Databuddy different from Google Analytics?",
		answer:
			"Databuddy loads a single script under 30 KB (GA4 is 45 KB+), uses no cookies, and is GDPR compliant by default. It also includes error tracking, Core Web Vitals monitoring, funnels, and feature flags — capabilities that require separate tools with GA.",
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
];

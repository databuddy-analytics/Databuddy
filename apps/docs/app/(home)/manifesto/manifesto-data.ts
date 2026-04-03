export type ManifestoBlock =
	| { type: "paragraph"; text: string }
	| { type: "callout"; text: string }
	| { type: "prompts"; items: readonly string[] };

export type ManifestoChapterId =
	| "analytics-is-broken"
	| "context-is-everything"
	| "privacy-is-the-default"
	| "ask-your-data"
	| "build-for-builders";

export interface ManifestoChapter {
	blocks: readonly ManifestoBlock[];
	id: ManifestoChapterId;
	number: string;
	title: string;
}

export const manifestoIntro = {
	title: "The Databuddy Manifesto",
	lead: [
		"I built Databuddy because I was tired of pretending the analytics industry wasn't broken. Every tool I used was either spying on my users, drowning me in dashboards I'd never read, or charging me enterprise prices to answer questions a five-year-old could phrase better.",
		"So I stopped waiting for someone to fix it. Here's what I believe.",
	],
} as const;

export const manifestoSections: readonly ManifestoChapter[] = [
	{
		id: "analytics-is-broken",
		number: "01",
		title: "Analytics Is Broken",
		blocks: [
			{
				type: "paragraph",
				text: "Google Analytics violated GDPR so many times that entire countries banned it. Then they replaced it with GA4, which somehow made everything worse. Amplitude costs more than most startups' entire cloud bill. PostHog ships a script heavier than some landing pages.",
			},
			{
				type: "paragraph",
				text: "And what do you get for all of it? Dashboards. Hundreds of dashboards nobody opens after the first week.",
			},
			{
				type: "paragraph",
				text: "The industry optimized for complexity because complexity justifies pricing tiers. More features, more seats, more events, more money. Nobody stopped to ask whether any of it actually helped you make a better product.",
			},
			{
				type: "callout",
				text: "If your tool needs a certification program, it's not a tool. It's a tax.",
			},
		],
	},
	{
		id: "context-is-everything",
		number: "02",
		title: "Context Is Everything",
		blocks: [
			{
				type: "paragraph",
				text: "Here's the dirty secret about privacy-focused analytics: most of them just show you numbers.",
			},
			{
				type: "paragraph",
				text: "Page views. Bounce rates. Referrers. Clean, private, and completely useless on their own.",
			},
			{
				type: "paragraph",
				text: "Knowing 500 people signed up yesterday tells you nothing. Knowing that 400 came from a Hacker News post, 60% hit an error on onboarding, and only 12 activated a core feature? That tells you exactly where to spend your morning.",
			},
			{
				type: "paragraph",
				text: "Raw data is not insight. Context is. That means connecting web analytics to product analytics to errors to performance, all in one place, so you can trace a user\u2019s journey from first click to \u201Caha\u201D moment without duct-taping four tools together.",
			},
			{
				type: "paragraph",
				text: "Every privacy tool out there got the first part right: stop tracking people. But they stopped too early. They gave you the numbers and left you to figure out the story yourself.",
			},
			{
				type: "callout",
				text: "I\u2019m building the tool that tells you the story.",
			},
		],
	},
	{
		id: "privacy-is-the-default",
		number: "03",
		title: "Privacy Is the Default, Not the Feature",
		blocks: [
			{
				type: "paragraph",
				text: "Some companies put \u201Cprivacy-first\u201D in their tagline and charge you extra for it. Others use it as a marketing angle while still fingerprinting your users behind the scenes.",
			},
			{
				type: "callout",
				text: "Privacy isn\u2019t a feature. It\u2019s the bare minimum.",
			},
			{
				type: "paragraph",
				text: "Databuddy\u2019s tracking script is 30KB. No cookies. No fingerprints. No personal identifiers. No consent banners scaring away 30\u201340% of your visitors before they even see your product. You install it, and it works. Your users never know it\u2019s there, because it never asks them for anything.",
			},
			{
				type: "paragraph",
				text: "This isn\u2019t a tradeoff. You don\u2019t lose insights by respecting people. You lose insights by making half your visitors click away from a cookie popup.",
			},
		],
	},
	{
		id: "ask-your-data",
		number: "04",
		title: "Ask Your Data Questions, Not Your Dashboard",
		blocks: [
			{
				type: "callout",
				text: "The best analytics UI is a conversation.",
			},
			{
				type: "paragraph",
				text: "I don\u2019t think you should need to learn a query builder, memorize filter syntax, or drag widgets around a canvas to understand your own product. You should just ask.",
			},
			{
				type: "prompts",
				items: [
					"How many users signed up yesterday?",
					"Show me errors from production in the last hour.",
					"Which feature has the highest drop-off after onboarding?",
				],
			},
			{
				type: "paragraph",
				text: "Databunny, the AI agent inside Databuddy, answers in seconds. It builds the charts. It writes the reports. It emails you the things you should care about before you even think to ask.",
			},
			{
				type: "paragraph",
				text: "The future of analytics isn\u2019t more dashboards. It\u2019s fewer. It\u2019s an agent that knows your data well enough to surface what matters and shut up about what doesn\u2019t.",
			},
		],
	},
	{
		id: "build-for-builders",
		number: "05",
		title: "Build for Builders",
		blocks: [
			{
				type: "paragraph",
				text: "Databuddy is for the founder who checks analytics between deploys. The engineer who wants to know if the feature they shipped last night actually moved a number. The two-person team that doesn\u2019t have a \u201Cdata person\u201D and shouldn\u2019t need one.",
			},
			{
				type: "paragraph",
				text: "I\u2019m not building for enterprises with 50-person data teams. I\u2019m building for the people who are actually making things, and who need their tools to stay out of the way while they do it.",
			},
			{
				type: "callout",
				text: "One script. One platform. The full picture.",
			},
			{
				type: "paragraph",
				text: "That\u2019s it. That\u2019s Databuddy.",
			},
		],
	},
] as const;

export const manifestoSignature = {
	name: "Issa Nassar",
	role: "Founder",
	company: "Databuddy Analytics",
} as const;
